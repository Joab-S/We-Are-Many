/** Botões de salvar, carregar e mundo novo, mais o aviso curto de resultado. */
export interface SaveUiActions {
  save(): Promise<void>;
  load(): Promise<void>;
  newWorld(): Promise<void>;
}

export interface SaveUi {
  toast(text: string): void;
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
  return { toast };
}
