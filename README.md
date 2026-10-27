# Checklist de Lojas

PWA para executar checklists operacionais no celular, com respostas e fotos armazenadas no aparelho durante períodos sem internet. O gerente acompanha as ações de correção e o administrador mantém os modelos.

O plano e o roteiro de aceite estão em [docs/ENTREGA.md](docs/ENTREGA.md); o registro de uso de IA está em [AI_LOG.md](AI_LOG.md). Os resultados verificados e as limitações estão ao fim deste arquivo.

## Rodar com Docker

Pré-requisito: Docker com Compose.

```sh
docker compose up --build
```

Abra [http://localhost:8088](http://localhost:8088). O ambiente inclui frontend, API, PostgreSQL e storage S3. Migrações e seed fazem parte da inicialização. O Compose usa valores locais de demonstração por padrão; `.env.example` lista as variáveis configuráveis.

API: [documentação](http://localhost:8088/api/docs), [OpenAPI JSON](http://localhost:8088/api/openapi.json) e [saúde](http://localhost:8088/api/health). A documentação é uma especificação OpenAPI; não inclui uma interface Swagger interativa.

### Contas de demonstração

Senha padrão de todas as contas: `Checklist@123`.

| E-mail | Perfil | Loja |
| --- | --- | --- |
| `admin@hering.local` | Administrador | Todas |
| `gerente@hering.local` | Gerente | Hering Blumenau |
| `operador@hering.local` | Operador | Hering Blumenau |
| `gerente2@hering.local` | Gerente | Hering São Paulo |
| `operador2@hering.local` | Operador | Hering São Paulo |

O seed cria duas lojas, três cargos, cinco usuários e os modelos Abertura da loja e Fechamento da loja. As credenciais são exclusivamente de demonstração; uma implantação pública precisa de segredos próprios e contas apropriadas.

## Desenvolvimento

Pré-requisitos: Node.js 24 e Docker. Para desenvolvimento com recarregamento automático:

```sh
cp .env.example .env
npm ci
docker compose up -d db storage
npm run dev
```

O frontend usa [http://localhost:5173](http://localhost:5173), a API usa a porta 3101, o PostgreSQL usa 55432 e o storage S3 usa 8333. A API carrega o `.env` da raiz. Se o Compose completo já estiver rodando, execute `docker compose stop web api` antes de iniciar o modo de desenvolvimento, para liberar a porta da API.

O modo de desenvolvimento não registra o service worker. Para testar instalação, recarga offline e sincronização do PWA, use o build servido pelo Compose na porta 8088.

Migrações e seed também podem ser executados separadamente:

```sh
npm run db:migrate -w @checklist/api
npm run db:seed -w @checklist/api
```

## Verificações

```sh
npm test
npm run typecheck
npm run build
```

Para testar a integração real, suba banco e storage e crie o `.env` conforme a seção de desenvolvimento:

```sh
RUN_INTEGRATION=1 npm test
```

Os testes de integração criam e removem seus próprios dados e arquivos. Sem `RUN_INTEGRATION=1`, esse teste é ignorado e as regras unitárias continuam sendo verificadas.

Para os testes de interface, mantenha o Compose completo em execução:

```sh
npx playwright install chromium webkit
npm run test:e2e
```

O Playwright usa Chromium com viewport Pixel 7 e WebKit com viewport iPhone 13. `E2E_BASE_URL` permite substituir `http://localhost:8088`. Os testes de interface criam dados de demonstração; os modelos criados na revisão administrativa são desativados ao final.

## Arquitetura

| Camada | Escolha e motivo |
| --- | --- |
| Interface | React 19, Vite 7 e TypeScript: aplicação responsiva com build PWA e contratos compartilhados. |
| Persistência no aparelho | IndexedDB com Dexie: execuções, respostas e arquivos de fotos disponíveis offline. |
| PWA | Manifest e service worker: instalação e cache dos arquivos da aplicação. |
| API | Node.js 24, Express e TypeScript: endpoints REST, validação e regras explícitas. |
| Banco | PostgreSQL 17: transações, restrições de unicidade e isolamento por loja. |
| Fotos | SeaweedFS com API S3: arquivos fora do PostgreSQL e URLs de upload assinadas. |

O storage S3 foi escolhido como equivalente ao MinIO sugerido no desafio. A interface acessa API e storage pelo mesmo domínio para simplificar o ambiente local e os dispositivos móveis.

## Regras do produto

- Operador acessa os dados da sua loja e os modelos do seu cargo. Gerente também pode executar modelos de operador.
- O administrador cria, edita e desativa modelos; lojas, usuários e cargos são fornecidos pelo seed.
- Item obrigatório exige resposta. Não conforme sempre exige foto, mesmo quando o item é opcional.
- A pontuação é `Conforme / (Conforme + Não conforme) × 100`. Não se aplica e itens opcionais sem resposta são ignorados; sem itens avaliáveis não há pontuação.
- Cada Não conforme gera uma ação para o gerente designado da loja, com prazo de 24 horas após a finalização.
- A execução finalizada é imutável e guarda uma cópia do modelo e dos itens. Editar um modelo não muda o histórico.
- Atualizar ou concluir uma ação exige conexão. A correção exige evidência fotográfica.

## Offline e sincronização

O primeiro login e o download dos modelos exigem internet. Depois disso, a aplicação permite executar, retomar e finalizar checklists com fotos offline. Os dados locais pertencem à conta e à loja autenticadas.

Os identificadores de execução, resposta e foto são gerados no aparelho. Reenvios utilizam os mesmos identificadores. A fila envia os dados, transfere as fotos usando URLs assinadas e confirma a conclusão. Uma execução só deve aparecer como sincronizada depois da confirmação de todas as fotos; os planos de ação são criados no servidor nessa confirmação.

O envio é retomado ao recuperar a conexão e ao abrir ou retomar a aplicação. Não há garantia de sincronização com a aplicação fechada em todos os dispositivos.

**Conflitos:** execuções finalizadas preservam seu conteúdo; as ações usam um campo de versão. Se outro cliente já alterou uma ação, a API retorna HTTP 409. O usuário deve recarregar o estado antes de aplicar a alteração novamente.

## Banco e histórico

As migrações ficam em `apps/api/migrations`. `template_versions` mantém as versões publicadas; a execução preserva o snapshot do modelo, e cada resposta guarda a descrição do item. Assim, o histórico continua legível e fiel ao que foi respondido mesmo depois de alterações no cadastro.

Índices definidos para as consultas principais:

| Índice | Consulta atendida |
| --- | --- |
| `users_store_role_idx` | Localizar o gerente ativo de uma loja. |
| `executions_store_finished_idx` | Histórico da loja ordenado pela finalização. |
| `responses_execution_idx` | Respostas de uma execução. |
| `actions_store_status_due_idx` | Ações da loja por estado e prazo. |
| `photos_response_idx` / `photos_action_idx` | Fotos de uma resposta ou evidências de uma ação. |

Chaves primárias e restrições únicas protegem os identificadores de execução, resposta e foto, uma resposta por item e uma ação por resposta Não conforme. O backend calcula a pontuação a partir das respostas e confere o conteúdo contra a versão do modelo armazenada no servidor.

### Fotos e acesso

As chaves de arquivo seguem `lojas/{lojaId}/execucoes/{execucaoId}/{fotoId}.{ext}` ou `lojas/{lojaId}/planos/{planoId}/{fotoId}.{ext}`. A organização da chave ajuda a localizar os arquivos; a proteção depende da autorização da API e das URLs assinadas, não do nome do caminho.

O banco guarda os metadados e a associação à resposta ou ação. O upload usa URL assinada com duração de 15 minutos; a leitura usa URL assinada de uma hora. Antes de confirmar o envio, a API confere tamanho e tipo do arquivo no storage.

## Uso no celular

Para instalar e usar o service worker em um celular, sirva o app por HTTPS. A exceção de desenvolvimento de `localhost` vale no próprio dispositivo; abrir o IP do computador por HTTP não equivale a HTTPS no celular.

Android e iPhone são os dispositivos-alvo. A instalação e a captura de foto devem ser verificadas em aparelhos reais; um teste de viewport no navegador não comprova esses comportamentos.

## Escopo e limitações

Prioridade: requisitos obrigatórios do desafio. Ranking de lojas, pesos por item, notificações e exportação em PDF ficam fora desta entrega. Não há telas de administração de lojas, cargos ou usuários; o seed atende a alternativa permitida pelo RF03. O versionamento dos modelos e a compressão de fotos no aparelho foram incluídos por sua relação com a integridade do histórico e o envio móvel.

Checklist offline não significa primeiro login offline nem edição offline de planos de ação. Dados ainda não enviados dependem do armazenamento do navegador: remover os dados do site ou desinstalar a aplicação pode apagá-los.

As listas remotas de execuções e ações retornam até 200 registros; paginação não foi implementada. As fotos armazenadas localmente são mantidas para permitir retomada e consulta no aparelho.

## Evidências da entrega

Verificações realizadas em 27/10/2026:

- Compose completo em execução; `/api/health` respondeu com sucesso.
- API: 7 testes aprovados, incluindo a integração real com PostgreSQL e SeaweedFS. Foram verificados pontuação, permissões, versões históricas, envios concorrentes sem duplicação, uploads e leituras assinadas, isolamento das fotos por loja e conclusão de ação com evidência.
- UX: 6 testes aprovados em Chromium e WebKit. Cobrem criação, ordenação, edição e desativação de modelo, item opcional, erros claros com foco no campo, retomada de respostas salvas e início/conclusão de ação pelo gerente com upload real da evidência. Os screenshots foram inspecionados e não houve overflow horizontal nas telas verificadas.
- Offline: 2 testes aprovados, um no Chromium e outro no WebKit. O app foi recarregado sem conexão; respostas e foto persistiram; a execução foi finalizada com pontuação de 66,67%; a reconexão sincronizou uma única execução e uma única ação, mesmo após reenvio.
- Build e typecheck aprovados. Ao todo, foram aprovados 7 testes da API e 8 cenários de ponta a ponta nos dois navegadores.

Não foram realizados testes em aparelhos físicos Android ou iPhone. Instalação real, captura pela câmera e comportamento do sistema operacional em segundo plano permanecem como validação manual de dispositivo.
