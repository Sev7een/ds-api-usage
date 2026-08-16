# DHS API Usage — plugin do DeepSeek Harness

[English](./README.md) | [简体中文](./README.zh-CN.md) | **Português (Brasil)**

Após a instalação, abra **Configurações → Uso da API** no [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) para visualizar o uso da sua API DeepSeek. A página mostra o saldo da sua conta, o gasto estimado, as contagens de tokens e o número de requisições de API nas últimas 24 horas (14 dias na visão diária), renderizados como um gráfico de barras em linha do tempo, semelhante à página oficial de uso da plataforma DeepSeek.

## Recursos

- 💰 **Cartão de saldo** — saldo total com divisão entre concedido / recarregado (com o código da moeda informado pela API, CNY ou USD), além de um selo de disponibilidade, obtido do endpoint oficial [`GET /user/balance`](https://api-docs.deepseek.com/api/get-user-balance/).
- 📊 **Cartões de métricas** — gasto estimado em 24h (CNY), contagens de tokens (divisão entrada / saída) e número de requisições de API.
- 📈 **Gráfico de linha do tempo** — barras por hora nas últimas 24 horas, ou por dia em 14 dias, alternando entre custo, tokens e requisições (passe o mouse para ver os valores exatos).
- 🔄 **Atualização ao vivo** — o saldo é atualizado a cada 60 s no host; a página consulta a cada 30 s e tem um botão de atualização manual.
- 🔑 **Sem configuração extra de chave** — reutiliza a credencial `DEEPSEEK_API_KEY` já existente na implantação por meio do serviço `credentials` do harness.

## Arquitetura

```
┌─────────────────────────────── Host (Node.js) ───────────────────────────────┐
│ src/index.js                                                                 │
│  • ctx.on('llm/stream', ...)  ← waterfall: acumula o TokenUsage informado    │
│      pelo provider em cada chamada real de modelo (entrada/saída/cache hit/  │
│      cache miss, já disjuntos, no vocabulário de cobrança da DeepSeek)       │
│      em buckets por hora + por dia em memória                                │
│  • fetchBalance()             ← credentials.resolve('DEEPSEEK_API_KEY')      │
│      → subprocess curl → https://api.deepseek.com/user/balance               │
│      (web.fetch não consegue enviar cabeçalho Authorization; por isso curl)  │
│  • webServer.register('/ds-api-usage/snapshot')  ← endpoint JSON p/ o client │
└──────────────────────────────────────────────────────────────────────────────┘
                              │ fetch('/ds-api-usage/snapshot')
                              ▼
┌────────────────────────────── Client (navegador) ────────────────────────────┐
│ client/bundle.js (bundle web; client/index.js = fonte do plugin dinâmico)   │
│  • slots.inject('settings.section')  → nova página (rótulo via serviço locale│
│  • cartão de saldo + 3 cartões de métricas + gráfico de barras               │
│      (custo / tokens / requisições; 24h ou 14d)                              │
│  • auto-atualização a cada 30 s (setInterval nativo no bundle estático)      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Observações sobre os dados

- **As contagens de tokens são reais** — vêm do chunk `usage` de cada chamada de modelo em streaming (`StreamChunk` com `type: 'usage'`, `TokenUsage`), os mesmos números informados pelo provider que o próprio harness usa nas estatísticas de sessão.
- **O custo é uma estimativa** — CNY é calculado a partir dos preços públicos da DeepSeek ([模型 & 价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)) na tabela `PRICING` gerada (`src/index.js`), aplicados por modelo:
  - entrada com cache hit → preço `hit`
  - entrada com cache miss → preço `miss`
  - saída → preço `output`
  - escrita de cache não é cobrada separadamente pela DeepSeek e é excluída.
  - desde 16/08/2026 a DeepSeek cobra por peak / off-peak: modelos com preços `peak` / `offPeak` são precificados pela hora UTC da requisição (janelas em `peakHoursUtc`; 01:00–04:00 e 06:00–10:00 UTC); os demais usam o preço `flat`.
- **Agregação persistida** — buckets por hora retêm 48 h e por dia 14 d, salvos em `$DSH_HOME/storages/ds-api-usage.json` (escrita com debounce de no máximo uma por 60 s, flush no encerramento do plugin, fail-safe: erro de leitura/escrita nunca quebra o accounting). A visão de 14 dias sobrevive a restarts do web app; apague o arquivo para zerar. O harness mantém separadamente sua própria projeção durável de tokens por sessão.

## Instalação

### Via `dsh plugin add` (recomendado, do GitHub ou npm)

Instale diretamente deste repositório GitHub:

```bash
dsh plugin --profile web add github:Sev7een/ds-api-usage
```

ou, uma vez publicado no npm:

```bash
dsh plugin --profile web add dsh-plugin-ds-api-usage
```

O `dsh plugin` repassa para o pnpm no diretório do profile e reconcilia o pacote na lista de bundles do profile (`dsh.profile.bundles`). O `cordis.patch.yml` do pacote (declarado via `dsh.bundle.patch` no `package.json`) então insere a linha do plugin na composição do host, e a declaração `dsh.client` faz o shell web carregar o `client/bundle.js` como a página de configurações.

### Como plugin dinâmico (dev / escopo de sessão)

O original é um plugin Cordis dinâmico, criado por sessão com `cordis_define` / `cordis_run` (veja a [documentação do DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness)). O corpo do `code.host` é o `src/index.js` sem o wrapper `module.exports`; o corpo do `code.client` é o `client/index.js` sem o wrapper.

> Nota: a forma dinâmica usa o canal privado da sandbox `harness.handle` / `host.call` (`client/index.js`), enquanto a forma de bundle estático (`client/bundle.js`) fala com o host pela rota HTTP `/ds-api-usage/snapshot`. Mantenha os dois em sincronia ao mudar o protocolo.

### Como plugin de composição (persistente, manual)

Adicione uma linha à composição do host (`cordis.patch.yml` do seu profile):

```yaml
- insert:
    - id: ds-api-usage
      name: 'dsh-plugin-ds-api-usage'
```

ou, sem instalar o pacote, por um caminho relativo até este repositório. O plugin é de *plano do host*: ele lê os serviços `credentials`, `subprocess`, `timer` e `webServer` do host e registra a página de configurações do client no slot `settings.section` de escopo raiz; portanto deve viver na **composição do host**, não dentro de um preset de agente.

### Requisitos

- DeepSeek Harness com o adaptador LLM DeepSeek configurado (credencial `DEEPSEEK_API_KEY` resolvível pelo serviço `credentials`)
- `curl` disponível no host para o endpoint de saldo
- Um client de navegador com a barra lateral de configurações (para a UI)

## Desenvolvimento

```bash
npm run check   # verifica a sintaxe das duas metades
npm test        # suíte de testes offline: parser de preços (fixtures) + lógica peak/off-peak
```

- Os preços são rastreados automaticamente: `.github/workflows/update-pricing.yml` (cron diário + acionamento manual) re-parseia as páginas oficiais de preços e abre um PR quando a tabela muda; `npm run update:pricing` faz o mesmo localmente (`--apply` grava o bloco gerado em `src/index.js`). Edite a tabela apenas pelo script — o bloco entre os marcadores `__PRICING_BEGIN__` / `__PRICING_END__` é gerado.
- O client localiza via o serviço `locale` do harness (namespace `settings.ds-api-usage`) e acompanha o idioma ativo do harness: há dicionários para os ids `zh`/`en` do harness e uma entrada `pt-BR` para suporte futuro (chaves ausentes no idioma ativo caem no `zh`).

## CI / GitHub Actions

O repositório traz dois workflows — nenhum segredo ou chave de API é necessário, e o único pré-requisito é o GitHub Actions estar habilitado no repositório (padrão; confira em **Settings → Actions → General → Allow all actions**):

- **`ci.yml`** — roda em todo push e pull request: `npm run check` (sintaxe das duas metades) e `npm test` (suíte offline com fixtures das páginas).
- **`update-pricing.yml`** — re-parseia as páginas oficiais de preços da DeepSeek diariamente (cron 06:23 UTC) e por acionamento manual (**Actions → update-pricing → Run workflow**). Quando a tabela muda, abre um PR com o bloco regenerado (o workflow declara `contents: write` e `pull-requests: write` no `GITHUB_TOKEN` padrão — nada a configurar). Se a página de docs for reestruturada, a validação do parser falha e o job falha ruidosamente, em vez de abrir um PR errado.

Após o primeiro push, rode **Actions → update-pricing → Run workflow** uma vez para validar o pipeline de ponta a ponta (resultado `no change` é o desfecho verde esperado quando os preços estão atualizados).

## Licença

[MIT](./LICENSE)
