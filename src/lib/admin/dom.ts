/**
 * Element construction and toasts.
 *
 * `el()` exists so that no guest-supplied value ever passes through innerHTML.
 * Everything in this table — names, messages, admin notes — was typed by
 * somebody else into a form on the public internet, and the admin page is the
 * one place it is rendered back with a session attached. Text goes in as
 * `textContent` and attributes go in as attributes; there is no code path here
 * that parses a string as markup.
 */

type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;
type Child = Node | string | number | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;

    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'value') {
      /* Property, not attribute: setting the attribute only seeds the initial
         value and is ignored once the user has typed. */
      (node as HTMLInputElement).value = String(value);
    } else if (key === 'checked') {
      (node as HTMLInputElement).checked = Boolean(value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  return node;
}

export function clear(node: Element): void {
  node.replaceChildren();
}

/**
 * A transient message. Errors stay until dismissed — a failed save that fades
 * away on its own is a change the couple believes they made and did not.
 */
export function toast(message: string, kind: 'ok' | 'error' = 'ok'): void {
  const host = document.getElementById('toasts');
  if (!host) return;

  const close = el('button', {
    class: 'toast__close',
    type: 'button',
    'aria-label': 'Dismiss',
    onclick: () => node.remove(),
  }, '×');

  const node = el('div', { class: `toast toast--${kind}`, role: 'status' },
    el('span', { class: 'toast__text' }, message),
    close,
  );

  host.append(node);
  if (kind === 'ok') setTimeout(() => node.remove(), 4000);
}
