/** Botões de salvar, carregar e mundo novo, mais o aviso curto de resultado. */
export interface SaveUiActions {
  save(): Promise<void>;
  load(): Promise<void>;
  newWorld(): Promise<void>;
}

export interface SaveUi {
  toast(text: string): void;
  /** Pergunta como o mundo novo começa; `null` se o jogador desistiu. */
  chooseNewWorld(): Promise<NewWorldChoice | null>;
}

/** Como pensam as pessoas do mundo novo: o mundo de vilas ou a mente generativa (gente espalhada, sem vila). */
export type NewWorldChoice = 'vilas' | 'generativa';

/** A caixa do mundo novo: apaga o save e escolhe a mente das pessoas. Esc ou clicar fora desiste. */
function chooseNewWorld(): Promise<NewWorldChoice | null> {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'new-world';
    back.innerHTML = `
      <div class="new-world-box" role="dialog" aria-modal="true" aria-labelledby="nw-title">
        <h2 id="nw-title">Começar um mundo novo?</h2>
        <p>O progresso salvo será apagado. Como pensam as pessoas dos planetas?</p>
        <button data-nw="vilas"><b>Com vilas</b><span>O mundo de sempre: aldeias, famílias, rotina, comércio e reinos.</span></button>
        <button data-nw="generativa"><b>Mente generativa</b><span>Gente espalhada, só com o instinto e sem vila. Cada pessoa gera o que fazer com o que percebe e aprende com o que dá certo.</span></button>
        <button data-nw="cancel" class="new-world-cancel">Cancelar</button>
      </div>`;
    const done = (choice: NewWorldChoice | null): void => {
      back.remove();
      window.removeEventListener('keydown', onKey, true);
      resolve(choice);
    };
    const onKey = (e: KeyboardEvent): void => {
      e.stopPropagation();
      if (e.key === 'Escape') done(null);
    };
    back.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-nw]')?.dataset.nw;
      if (a === 'vilas' || a === 'generativa') done(a);
      else if (a === 'cancel' || e.target === back) done(null);
    });
    window.addEventListener('keydown', onKey, true);
    document.body.appendChild(back);
    back.querySelector<HTMLElement>('[data-nw="vilas"]')!.focus();
  });
}

export function createSaveUi(actions: SaveUiActions): SaveUi {
  const bar = document.createElement('div');
  bar.className = 'save-bar';
  bar.innerHTML = `
    <button data-a="save" title="Salvar o jogo (Ctrl+S)">💾 Salvar</button>
    <button data-a="load" title="Voltar ao último save">⟳ Carregar</button>
    <button data-a="new" title="Apagar o save e começar um mundo novo">✚ Mundo novo</button>
    <span class="save-toast" hidden></span>`;
  document.body.appendChild(bar);
  const note = bar.querySelector<HTMLElement>('.save-toast')!;
  let timer = 0;
  const toast = (text: string): void => {
    note.textContent = text;
    note.hidden = false;
    clearTimeout(timer);
    timer = window.setTimeout(() => (note.hidden = true), 4000);
  };
  const run: Record<string, () => Promise<void>> = { save: actions.save, load: actions.load, new: actions.newWorld };
  bar.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('button')?.dataset.a;
    if (a) void run[a]().catch((err) => toast(`Erro: ${String(err)}`));
    (document.activeElement as HTMLElement | null)?.blur();
  });
  // Ctrl+S salva em vez de abrir "Salvar página".
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
      e.preventDefault();
      void actions.save();
    }
  });
  // Teclas do jogo não devem disparar enquanto o foco está nos botões.
  bar.addEventListener('keydown', (e) => e.stopPropagation());
  return { toast, chooseNewWorld };
}
