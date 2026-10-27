# Uso de IA

## Ferramentas e tarefas

Codex foi utilizado para ler e analisar o desafio, discutir arquitetura, dividir o trabalho entre agentes de implementação e revisão, produzir código e documentação e executar verificações. A revisão de UX e UI considerou o fluxo mobile, estados offline, recuperação de fotos e comunicação breve.

Os agentes trabalham no mesmo repositório. A divisão de trabalho e as revisões por outros agentes também são uso de IA, não revisão humana independente.

## Prompts importantes

Os trechos abaixo são registros resumidos do contexto e das solicitações recebidas. Não representam uma transcrição completa da conversa.

1. **Análise do desafio:** ler todo o projeto e o PDF, identificar pegadinhas, propor uma entrega passo a passo e discutir UI e UX para uma interface intuitiva, com comunicação clara e breve, sem informações irrelevantes.
2. **Revisão UX:** ler integralmente o texto extraído das seis páginas do PDF; propor fluxo mobile mínimo, telas por perfil, recuperação offline e de fotos, microcopy pt-BR e ambiguidades críticas; distinguir exigências do documento de recomendações.
3. **Recorte de execução:** considerar prazo de duas horas, React e Node.js com TypeScript, com uso em Android e iPhone; priorizar os requisitos obrigatórios de ponta a ponta.
4. **Implementação da interface:** implementar um frontend real em React, Vite e TypeScript, mobile first e em pt-BR; operador com Checklists e Histórico, gerente também com Ações, administrador com Modelos; integrar à biblioteca de persistência e sincronização, considerando Android, iPhone e o prazo de duas horas.
5. **Implementação da API:** criar uma API Node.js/Express em TypeScript com JWT, modelos versionados, sincronização em preparação/upload/confirmação, idempotência por UUID e hash, autorização por loja, ações com evidência, cinco usuários de demonstração e testes com banco e storage reais.

## Erros e correções

1. **Variáveis do storage divergentes entre agentes.** A implementação inicial do storage lia `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` e `S3_BROWSER_URL_PREFIX`, enquanto o Compose definia `S3_ACCESS_KEY`, `S3_SECRET_KEY` e `S3_PUBLIC_PREFIX`. A revisão cruzada da documentação com o código identificou o problema. Foram adicionados aliases coerentes, e a integração real validou uploads e leituras assinadas.
2. **Porta ocupada tratada como inicialização bem-sucedida.** A primeira versão do callback de `listen` não tratava o erro recebido pelo Express 5. O teste do ambiente revelou uma mensagem de sucesso mesmo com a porta ocupada. O callback passou a registrar a falha, encerrar as conexões e sair com código 1; um teste específico de porta ocupada confirmou a correção.
3. **Tipagem incorreta no servidor de testes.** Passar `resolve` diretamente ao callback de `listen` não correspondia à assinatura do Express 5. O typecheck detectou o erro; o callback foi ajustado para tratar `error` e chamar `reject` ou `resolve` adequadamente.
4. **Configuração local incompleta nos comandos de banco.** A carga de `.env` inicialmente estava apenas no servidor, deixando os comandos isolados de migração e seed sujeitos a defaults diferentes. A revisão verificou os entrypoints; a inicialização do ambiente passou a ser importada pelo módulo de banco compartilhado.
5. **Fotos falharam no IndexedDB do WebKit.** O teste offline passou no Chromium, mas falhou ao salvar a imagem no WebKit. Uma reprodução mínima também falhou ao armazenar um `Blob` simples, com `UnknownError: Error preparing Blob/File data to be stored in object store`. A persistência foi alterada para guardar bytes em `ArrayBuffer` no IndexedDB e reconstituir o `Blob` para exibição e upload, preservando a leitura do formato anterior. Após a correção, o fluxo de foto, recarga offline, finalização e sincronização passou nos dois navegadores. A limpeza imediata do campo de arquivo também foi corrigida como medida de robustez, mas não era a causa comprovada dessa falha.

Esses erros foram detectados e corrigidos durante desenvolvimento e verificação por agentes de IA. Isso não equivale a uma auditoria humana independente.

## Trabalho sem IA

O usuário forneceu o desafio, o prazo, a stack e os dispositivos-alvo. Até este registro, não foi informado um trecho de código implementado manualmente sem IA. Não atribuímos à pessoa tarefas de programação ou validações que não foram observadas.

## Proporção estimada

Aproximadamente 100% do código desta implementação foi produzido por agentes de IA. É uma estimativa de autoria do trabalho observado nesta sessão, não uma medição automática linha a linha. A pessoa forneceu contexto, decisões e direcionamento; não foi registrado código manual que justificasse reduzir essa estimativa.
