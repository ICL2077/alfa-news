import { deliverPolicies, NatsJetStreamService } from '@app/nats-jet-stream';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { chatStream } from 'contract/chat.contract';
import { companyStream } from 'contract/company.contract';
import { newsStream } from 'contract/news.contract';

interface Consumer {
  name: string;
  filter: string;
  deliverPolicy?: deliverPolicies;
  ackWait?: number;
}

// массив потоков и их консьюмеров
const streamSchemas = [
  // описываем поток новостей
  {
    name: newsStream.name,
    subjects: newsStream.subjects.core,
    consumers: [
      // nest: потребление уже готовых новостей (тех что нужно записать в ArticleMatch)
      {
        name: newsStream.consumers.nestNewsConsumer,
        filter: newsStream.filters.nestConsumer,
      },
      // pthon: принятие спарсенных новостей для определения какая новость нужна какой компании и почему
      {
        name: newsStream.consumers.mlNewsConsumer,
        filter: newsStream.filters.mlConsumer,
        ackWait: 5 * 60 * 1000,
      },
      // python: архивные новости для только что готовой компании (оцениваются только для неё)
      {
        name: newsStream.consumers.mlBacklogConsumer,
        filter: newsStream.filters.mlBacklogConsumer,
        ackWait: 2 * 60 * 1000,
      },
    ] as Consumer[],
  },
  // описываем поток компаний
  {
    name: companyStream.name,
    subjects: companyStream.subject.core,
    maxMsgsPerSubject: 1,
    consumers: [
      // pyhon консьюмер - очередь запросов на обогащение
      {
        name: companyStream.consumers.mlEnrich,
        filter: companyStream.filters.enrich,
        ackWait: 5 * 60 * 1000,
      },
      // nest консьюмер - получение подробной информации о компании (с keywords)
      {
        name: companyStream.consumers.nestEnriched,
        filter: companyStream.filters.enriched,
      },
      // company.ready Python будет читать эфемерной подпиской
    ] as Consumer[],
  },
  // описываем поток чатов
  {
    name: chatStream.name,
    subjects: chatStream.subjects.core,
    consumers: [
      {
        name: chatStream.consumers.mlRequest,
        filter: chatStream.filters.request,
        ackWait: 3 * 60 * 1000, // 3 минуты
      },
      {
        name: chatStream.consumers.nestResponse,
        filter: chatStream.filters.response,
      },
    ],
  },
];

@Injectable()
export class NatsBootstrapService implements OnModuleInit {
  constructor(private JSService: NatsJetStreamService) {}

  async onModuleInit() {
    for (const schema of streamSchemas) {
      await this.JSService.ensureMessagesStream(schema.name, schema.subjects, {
        maxMsgsPerSubject: schema.maxMsgsPerSubject,
      });
      for (const consumer of schema.consumers) {
        await this.JSService.ensureMessagesConsumer(
          schema.name,
          consumer.name,
          consumer.filter,
          {
            deliverPolicy: consumer.deliverPolicy,
            ackWait: consumer.ackWait,
          },
        );
      }
    }
  }
}
