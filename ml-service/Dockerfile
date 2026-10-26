FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.lock ./
RUN python -m pip install --no-cache-dir -r requirements.lock

RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --home-dir /app app \
    && mkdir -p /app/data/alfa_cache /app/data/bank_cache \
    && chown -R app:app /app

COPY --chown=app:app app/ ./app/
COPY --chown=app:app contract/ ./contract/

USER 10001:10001

CMD ["python", "-m", "app.consumer"]
