# Entrega do checklist PWA

## Objetivo

Permitir que funcionários executem checklists da sua loja no celular, registrem fotos e continuem trabalhando sem internet. O gerente acompanha a correção das não conformidades. O administrador mantém os modelos.

O desafio foi analisado integralmente a partir do PDF de seis páginas. O prazo de trabalho informado pelo usuário é de duas horas; a implementação usa React e Node.js com TypeScript e considera Android e iPhone.

## Ordem de entrega

1. Autenticação, autorização por loja e cargo, banco, storage e dados de demonstração.
2. Modelos e edição pelo administrador; seleção dos modelos permitidos para cada usuário.
3. Execução com respostas, fotos, retomada local e validação da finalização.
4. Persistência offline e sincronização idempotente de dados e fotos.
5. Histórico e planos de ação com evidência de correção.
6. Testes das regras, conferência do fluxo no navegador, documentação e execução com Docker Compose.

Ranking, pesos diferentes, notificações e exportação em PDF não fazem parte do primeiro ciclo. Os requisitos obrigatórios têm prioridade.

## Decisões e critérios de UX

- Operador: Checklists e Histórico. Gerente: Checklists, Ações e Histórico. Administrador: gestão de modelos.
- A loja deve estar identificada. O funcionário não escolhe uma loja diferente durante a execução.
- A execução usa uma lista de itens e três respostas por extenso: Conforme, Não conforme e Não se aplica.
- Não conforme sempre exige foto, inclusive em item opcional. Observação permanece opcional.
- Cada resposta e foto precisa ser persistida localmente antes de ser apresentada como salva.
- Finalizar deve informar as pendências e levar ao primeiro item incompleto. Um botão desabilitado sem explicação não orienta o usuário.
- A conclusão da execução e o envio ao servidor são estados diferentes.
- Uma execução só pode aparecer como sincronizada depois da confirmação de todos os seus dados e fotos.
- Cor acompanha texto ou ícone; não é o único meio de indicar a resposta ou uma falha.
- Controles de resposta e ações principais devem ser confortáveis para toque e ter rótulos claros.
- O primeiro login e o download dos modelos exigem conexão. A disponibilidade offline precisa corresponder aos dados realmente armazenados.
- O aplicativo deve preservar o trabalho local quando houver falha de rede ou expiração de sessão.
- Não prometer sincronização com o aplicativo fechado em qualquer celular. Ao abrir ou retomar o aplicativo, o envio pendente deve ser retomado.

## Regras definidas para esta entrega

- Gerentes executam modelos de gerente e de operador; operadores executam apenas os modelos do seu cargo.
- Cada Não conforme gera uma ação para o gerente designado da loja, com prazo de 24 horas após a finalização da execução.
- Planos de ação são atualizados somente online. Checklist, respostas e fotos da execução funcionam offline após a preparação inicial.
- Atualizações de ações usam uma versão inteira. Uma alteração baseada em versão antiga recebe conflito HTTP 409 e exige recarregar os dados.
- A execução guarda uma cópia do modelo e seus itens. Alterações posteriores do modelo não reescrevem o histórico.
- A pontuação é `Conforme ÷ (Conforme + Não conforme) × 100`, com duas casas decimais. Não se aplica e itens opcionais sem resposta ficam fora do cálculo. Sem respostas aplicáveis, a pontuação é ausente.
- Lojas, usuários e cargos são fornecidos por dados iniciais. O cadastro e a edição de modelos têm interface própria.

Essas regras resolvem lacunas do documento e reduzem o escopo para o prazo disponível. O prazo de 24 horas e o acesso do gerente aos modelos de operador são escolhas desta implementação.

## Comunicação breve

| Situação | Texto de referência |
| --- | --- |
| Sem conexão | Sem internet |
| Persistência local confirmada | Salvo neste aparelho |
| Modelo baixado | Disponível sem internet |
| Item obrigatório vazio | Responda este item para finalizar. |
| Não conformidade sem foto | Adicione uma foto da não conformidade. |
| Finalização offline | Checklist concluído. Envio pendente. |
| Envio em andamento | Enviando checklist e fotos… |
| Falha de envio | Não foi possível enviar. Vamos tentar novamente. |
| Nova tentativa manual | Tentar novamente |
| Conclusão de ação sem evidência | Adicione uma foto da correção. |

Estes textos orientam a interface; a verificação final deve registrar os textos efetivamente implementados.

## Roteiro de aceite

Este roteiro descreve o que verificar, não afirma que os testes já foram executados.

1. Subir front, API, PostgreSQL e storage com `docker compose up` e entrar com um usuário de demonstração.
2. Conferir que usuários de uma loja não acessam execuções, ações ou fotos de outra loja.
3. Como administrador, criar, editar, ordenar itens e desativar um modelo.
4. Como operador, abrir um modelo, responder itens e retomar uma execução interrompida.
5. Tentar finalizar com item obrigatório sem resposta e com Não conforme sem foto; conferir mensagens e foco no problema.
6. Responder Conforme, Não conforme e Não se aplica; conferir a pontuação, que exclui Não se aplica.
7. Após o primeiro acesso online e a indicação “Disponível offline”, desativar a conexão, recarregar o app, executar um checklist, adicionar foto e finalizar. Em `localhost`, usar DevTools → Network → Offline; apenas desligar Wi-Fi não interrompe o acesso local.
8. Fechar e reabrir o aplicativo offline; conferir respostas e fotos locais.
9. Restabelecer a conexão; conferir o envio automático, as imagens no histórico e a ausência de registros duplicados após reenvio.
10. Interromper a conexão durante o envio de uma foto; conferir que a execução fica pendente ou com erro e que a nova tentativa preserva os dados.
11. Como gerente, iniciar e concluir uma ação com evidência de correção.
12. Conferir no Android e no iPhone a instalação, câmera/galeria, navegação e retomada. A simulação no navegador não substitui a verificação em aparelhos reais.

## Evidências

As evidências executadas ficam na seção “Evidências da entrega” do README. Foram aprovados 10 testes da API e 8 cenários de ponta a ponta em Chromium e WebKit, incluindo o fluxo completo offline e a conclusão de ações na interface do gerente. Os testes da API incluem o hosting Node e uploads/leituras reais pelo proxy S3.

Os mesmos 8 cenários de ponta a ponta também passaram no build conjunto de `Dockerfile.deploy`, servido localmente em `http://localhost:8089`. A revisão de telas não substitui instalação e câmera em aparelhos físicos.

## Publicação

O repositório é privado: [duosis-ti/app-checklist-hering-pwa](https://github.com/duosis-ti/app-checklist-hering-pwa).

A aplicação está publicada no [Railway](https://app-production-5aedb.up.railway.app) com três serviços: aplicação Node/SPA no mesmo domínio HTTPS, PostgreSQL com volume persistente de 1 GB e SeaweedFS com volume persistente de 1 GB. A aplicação encaminha `/storage` ao endpoint S3 interno, preservando as URLs assinadas. O deploy automático acompanha a branch `main`.

Os três serviços iniciaram com sucesso e o endpoint público de saúde respondeu HTTP 200. Os mesmos 8 cenários de ponta a ponta também passaram na URL publicada, em Chromium e WebKit. A leitura de foto assinada respondeu HTTP 200, a leitura sem assinatura retornou HTTP 403 e os endpoints protegidos sem JWT retornaram HTTP 401. A instalação e a câmera em aparelhos físicos continuam pendentes de validação manual.
