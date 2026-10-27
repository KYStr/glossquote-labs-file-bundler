import { createBundleController } from './state.js';
import { createUI } from './ui.js';

let controller;
const ui = createUI(document, sourceIndex => {
  controller.removeFile(sourceIndex);
  const remaining = [...ui.el('files-list').querySelectorAll('button')];
  (remaining.find(button => Number(button.dataset.sourceIndex) > sourceIndex) ?? remaining.at(-1) ?? ui.el('files')).focus();
});
controller = createBundleController({
  workerFactory: () => new Worker(new URL('./bundle-worker.js', import.meta.url), { type: 'module', name: 'file-bundler' }),
  urls: URL,
  onChange: ui.render
});
ui.el('files').addEventListener('change', event => {
  const selected = Array.from(event.target.files ?? []);
  event.target.value = '';
  controller.selectFiles(selected);
});
ui.el('package-limit').addEventListener('input', event => controller.setLimitInput(event.target.value));
ui.el('build').addEventListener('click', () => { void controller.start(); });
ui.el('cancel').addEventListener('click', () => controller.cancel());
ui.el('clear').addEventListener('click', () => { controller.reset(); ui.el('files').value = ''; });
const dropZone = ui.el('drop-zone');
dropZone.addEventListener('dragover', event => { event.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', event => {
  event.preventDefault();
  dropZone.classList.remove('dragging');
  const items = Array.from(event.dataTransfer?.items ?? []);
  if (items.some(item => item.kind === 'file' && item.webkitGetAsEntry?.()?.isDirectory)) {
    controller.rejectSelection();
    return;
  }
  const dropped = Array.from(event.dataTransfer?.files ?? []);
  if (dropped.length) controller.selectFiles(dropped);
});
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());
window.addEventListener('pagehide', () => { controller.pagehide(); ui.el('files').value = ''; });
ui.render(controller.snapshot());
document.documentElement.dataset.script = 'ready';
