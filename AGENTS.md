# Para IAs de código

Antes de testar, abrir ou atualizar um PR, leia `.claude/skills/testar-pr/SKILL.md`: diz o que rodar para cada tipo de mudança e como gastar pouco tempo e poucos tokens. Em resumo:

- Enquanto trabalha: `npx vitest run <arquivo ou pasta da mudança>` e `npm run test:rapido` (cerca de 20 s).
- Uma vez, antes de abrir o PR: `npm run build`, `npm test` (cerca de 3 min) e `npm run test:jogo` (cerca de 2 min), um por vez.
- Nos pushes seguintes do mesmo PR, só o que o commit toca: o CI roda tudo de novo.
- Os PRs vão para a `development`, com o texto em português.
