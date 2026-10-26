#!/usr/bin/env python3
"""Update the registered Dokploy Compose resource using published images."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', default='/opt/corpo-news/deploy/dokploy.json')
    parser.add_argument('--source', default=str(Path(__file__).with_name('docker-compose.yml')))
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    tag = os.environ.get('IMAGE_TAG', '')
    if not re.fullmatch(r'[0-9a-f]{40}', tag):
        raise RuntimeError('IMAGE_TAG должен содержать полный hash коммита')
    config = json.loads(Path(args.config).read_text())
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def api(route, data=None, query=None):
        url = config['DOKPLOY_URL'].rstrip('/') + '/api/' + route
        if query:
            url += '?' + urllib.parse.urlencode(query)
        request = urllib.request.Request(
            url, data=json.dumps(data).encode() if data is not None else None,
            headers={'x-api-key': config['DOKPLOY_TOKEN'], 'Content-Type': 'application/json'},
        )
        try:
            with opener.open(request, timeout=30) as response:
                body = response.read()
                return json.loads(body) if body else None
        except urllib.error.HTTPError as error:
            raise RuntimeError(f'Dokploy {route}: HTTP {error.code}') from None
        except urllib.error.URLError:
            raise RuntimeError(f'Dokploy {route}: соединение недоступно') from None

    compose_id = config['composeId']
    resource = api('compose.one', query={'composeId': compose_id})
    if args.check:
        print(f"Dokploy: {resource['appName']}, состояние {resource['composeStatus']}")
        return
    result = subprocess.run(
        ['docker', 'compose', '-f', args.source, 'config', '--no-interpolate',
         '--no-path-resolution', '--no-env-resolution', '--format', 'json'],
        capture_output=True, text=True,
    )
    if result.returncode:
        raise RuntimeError('Не удалось разобрать Compose; публикация конфигурации отменена')
    compose = json.loads(result.stdout)
    compose.pop('name', None)
    compose.get('networks', {}).get('default', {}).pop('name', None)
    for name, service in compose['services'].items():
        service.pop('build', None)
        if name in ('backend', 'ml-service', 'proxy'):
            service['pull_policy'] = 'always'
    for name in compose['volumes']:
        compose['volumes'][name] = {'external': True, 'name': 'corpo-news-demo_' + name}
    for volume in compose['services']['ml-service']['volumes']:
        if volume['target'] == '/app/data/csv':
            volume['source'] = '${BANK_CSV_HOST_DIR:-/opt/corpo-news/deploy/data/csv}'
        elif volume['target'] == '/app/data/alfa_pdfs':
            volume['source'] = '${BANK_PDF_HOST_DIR:-/opt/corpo-news/deploy/data/demo-bank-pdfs}'
        if volume['target'] in ('/app/data/csv', '/app/data/alfa_pdfs'):
            volume['type'] = 'bind'
            volume.pop('volume', None)
            volume['bind'] = {'create_host_path': False}
    env_lines = [line for line in (resource.get('env') or '').splitlines()
                 if not re.match(r'^\s*(?:export\s+)?IMAGE_TAG\s*=', line)]
    env_lines.append('IMAGE_TAG=' + tag)
    api('compose.update', {
        'composeId': compose_id, 'composeFile': json.dumps(compose),
        'env': '\n'.join(env_lines) + '\n', 'createEnvFile': True,
    })
    before = api('deployment.allByCompose', query={'composeId': compose_id})
    previous = {item['deploymentId'] for item in before}
    title = 'Обновление main@' + tag[:7]
    api('compose.deploy', {
        'composeId': compose_id, 'title': title,
        'description': 'Опубликованные образы и конфигурация Compose',
    })
    deadline = time.monotonic() + 900
    while time.monotonic() < deadline:
        deployments = api('deployment.allByCompose', query={'composeId': compose_id})
        current = [d for d in deployments if d['deploymentId'] not in previous and d.get('title') == title]
        if current:
            latest = max(current, key=lambda item: item['createdAt'])
            if latest['status'] == 'done':
                print(f"Dokploy: развёртывание {tag[:7]} завершено ({latest['deploymentId']})")
                return
            if latest['status'] in ('error', 'cancelled'):
                raise RuntimeError('Dokploy: развёртывание завершилось ошибкой; см. журнал в панели')
        time.sleep(5)
    raise RuntimeError('Dokploy: превышено время ожидания развёртывания')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError) as error:
        raise SystemExit(str(error)) from None
