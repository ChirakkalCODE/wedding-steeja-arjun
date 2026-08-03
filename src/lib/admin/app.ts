/**
 * The admin area. Client-rendered, because GitHub Pages cannot check a session
 * server-side — there is no server of ours to check one.
 *
 * ---------------------------------------------------------------------------
 * What actually protects this
 * ---------------------------------------------------------------------------
 * Not this file. Every read and write below goes out as the signed-in user and
 * is judged by RLS, and the policies require membership of `private.admins`
 * (see 0002/0003). Being authenticated is explicitly not enough: the anon key
 * is public and sign-up has minted `authenticated` JWTs for strangers before,
 * which is the whole reason the allowlist exists.
 *
 * So the UI here is a convenience over a database that would refuse the same
 * requests made with curl. Nothing is hidden as a security measure — hiding a
 * button is not a control — and the service-role key appears nowhere in this
 * bundle. If a query returns nothing, that is the database's answer.
 *
 * ---------------------------------------------------------------------------
 * One thing this cannot tell you
 * ---------------------------------------------------------------------------
 * A signed-in user who is NOT on the allowlist gets an empty result set, not an
 * error — RLS filters rows, it does not complain. That is indistinguishable
 * over the wire from a guest list with no replies in it yet, and both are
 * states this page will genuinely be in (the second for weeks before the
 * invitations go out).
 *
 * Distinguishing them would need a server-side check, and the only one
 * available was deliberately moved out of the API surface by 0003. So rather
 * than guess, the empty state says both things: no entries, and here is the
 * other reason you might be seeing this. See `renderEmpty`.
 */
import { supabase, type Rsvp } from '../supabase';
import { computeStats, duplicatePhones } from './stats';
import { downloadCsv } from './csv';
import { clear, el, toast } from './dom';

type Filter = 'all' | 'coming' | 'not-coming' | 'has-message';
type Sort = 'received' | 'party';

const state = {
  rows: [] as Rsvp[],
  query: '',
  filter: 'all' as Filter,
  sort: 'received' as Sort,
  expanded: new Set<string>(),
  loading: true,
  loadFailed: false,
  /**
   * Whether this session is on the allowlist. `null` until asked.
   *
   * Needed because RLS *filters* rather than raises: a signed-in account that
   * is not on the list gets an empty result set, which is byte for byte what a
   * guest list with no replies yet looks like. Without this the couple would
   * read "No entries yet" and reasonably conclude the replies had been lost.
   * See supabase/migrations/0004_is_admin_probe.sql.
   */
  isAdmin: null as boolean | null,
  /* Shown back to the reader in the not-allowlisted screen, so they can tell at
     a glance whether they are signed in as the account they meant to be. */
  userId: undefined as string | undefined,
  email: undefined as string | undefined,
};

let root: HTMLElement;

/* -------------------------------------------------------------------------
   Session
   ------------------------------------------------------------------------- */

/**
 * A dead or expired session must land on the login form, never on a blank page
 * or a console error. PostgREST reports it as 401/PGRST301 rather than as a
 * network failure, so it arrives looking like an ordinary query result.
 */
function isAuthFailure(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  const message = (error.message ?? '').toLowerCase();
  return (
    code === 'PGRST301' ||
    code === '401' ||
    message.includes('jwt') ||
    message.includes('token is expired') ||
    message.includes('not authenticated')
  );
}

async function handleExpiredSession(): Promise<void> {
  /* Clear the stored session too, or the next load reads a token the server
     has already rejected and shows a dashboard that cannot fetch anything. */
  await supabase.auth.signOut().catch(() => {});
  renderLogin('Your session has expired. Please sign in again.');
}

/* -------------------------------------------------------------------------
   Login
   ------------------------------------------------------------------------- */

function renderLogin(notice?: string): void {
  clear(root);

  const error = el('p', { class: 'admin__error', role: 'alert' }, notice ?? '');
  const email = el('input', {
    class: 'admin__input', id: 'admin-email', type: 'email',
    autocomplete: 'username', required: true, inputmode: 'email',
  });
  const password = el('input', {
    class: 'admin__input', id: 'admin-password', type: 'password',
    autocomplete: 'current-password', required: true,
  });
  const submit = el('button', { class: 'admin__button', type: 'submit' }, 'Sign in');

  const form = el('form', {
    class: 'admin__login',
    novalidate: true,
    onsubmit: async (event: Event) => {
      event.preventDefault();
      if (submit.disabled) return;

      submit.disabled = true;
      submit.textContent = 'Signing in…';
      error.textContent = '';

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.value.trim(),
        password: password.value,
      });

      if (authError) {
        /* One message for every failure. Distinguishing "no such address" from
           "wrong password" turns the login form into an oracle for which
           addresses have accounts — and there is exactly one account here, so
           confirming its address costs everything and gains nothing. */
        error.textContent = 'That email address and password did not match.';
        submit.disabled = false;
        submit.textContent = 'Sign in';
        password.value = '';
        password.focus();
        return;
      }

      /* No redirect: the dashboard is this same page. onAuthStateChange picks
         the session up and swaps the view. */
    },
  },
    el('h1', { class: 'admin__title' }, 'Guest list'),
    el('p', { class: 'admin__lead' }, 'Sign in to see the replies.'),
    el('label', { class: 'admin__label', for: 'admin-email' }, 'Email'),
    email,
    el('label', { class: 'admin__label', for: 'admin-password' }, 'Password'),
    password,
    error,
    submit,
  );

  root.append(el('div', { class: 'admin__centre' }, form));
  email.focus();
}

/* -------------------------------------------------------------------------
   Data
   ------------------------------------------------------------------------- */

async function loadRows(): Promise<void> {
  state.loading = true;
  state.loadFailed = false;
  renderDashboard();

  /* Asked alongside the rows, not instead of them. A `false` here is the only
     thing that can tell an empty table apart from a revoked account — and the
     account being revoked is the likelier of the two, because deleting and
     recreating the admin user cascades the allowlist row away without a word. */
  const probe = await supabase.rpc('is_admin');
  if (probe.error && isAuthFailure(probe.error)) return handleExpiredSession();
  /* A missing function (an older database) is not a reason to block the view:
     fall back to the ambiguous-but-harmless "assume allowed" and let the empty
     state carry its softer hint. */
  state.isAdmin = probe.error ? null : Boolean(probe.data);

  const { data, error } = await supabase
    .from('rsvps')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    if (isAuthFailure(error)) return handleExpiredSession();
    state.loading = false;
    state.loadFailed = true;
    renderDashboard();
    toast('Could not load the replies. Check your connection and try again.', 'error');
    return;
  }

  state.rows = (data ?? []) as Rsvp[];
  state.loading = false;
  renderDashboard();
}

/**
 * Optimistic write. The change is on screen before the request leaves, and is
 * put back exactly as it was if the database refuses it — which it will, for
 * example, if an edited phone number stops matching the E.164 constraint.
 */
async function patch(
  id: string,
  changes: Partial<Rsvp>,
  /**
   * Whether to rebuild the whole dashboard.
   *
   * `false` for edits made inside an open row, and that is not an optimisation
   * — it is the difference between a usable editor and one that fights you. A
   * full rebuild destroys the very input whose `blur` triggered the save, which
   * (a) throws away focus mid-Tab, so the field you were moving to vanishes
   * from under the caret, and (b) can re-fire `blur` on the discarded node in
   * browsers that dispatch it on removal — re-entering this function
   * synchronously, forever. Only the counters and the row's summary line
   * actually depend on the change, so only those are rebuilt.
   */
  { rerender = true }: { rerender?: boolean } = {},
): Promise<boolean> {
  const index = state.rows.findIndex((r) => r.id === id);
  if (index === -1) return false;

  const before = state.rows[index];
  const after = { ...before, ...changes };

  /* party_size is generated by the database. Mirror it locally so the counters
     do not sit wrong until the next reload. */
  if (changes.companions) {
    after.party_size = 1 + changes.companions.length;
  }

  state.rows[index] = after;
  if (rerender) renderDashboard();
  else refreshInPlace(id);

  const { data, error } = await supabase
    .from('rsvps')
    .update(changes)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (isAuthFailure(error)) {
      await handleExpiredSession();
      return false;
    }
    state.rows[index] = before;
    renderDashboard();
    toast(`Could not save that change. ${error.message}`, 'error');
    return false;
  }

  /* Take the server's row: it carries the regenerated party_size and
     phone_normalised, which the duplicate marker reads. */
  state.rows[index] = data as Rsvp;
  if (rerender) renderDashboard();
  else refreshInPlace(id);
  return true;
}

/** An edit made inside an open row: save without tearing the editor down. */
const patchInRow = (id: string, changes: Partial<Rsvp>) =>
  patch(id, changes, { rerender: false });

/**
 * Rebuild only what the change can have altered: the counters, and the summary
 * line of the row that changed. Leaves every open editor — and the caret inside
 * it — exactly where it was.
 */
function refreshInPlace(id: string): void {
  const stats = document.querySelector('.stats');
  if (stats) stats.replaceWith(renderStats());

  const row = state.rows.find((r) => r.id === id);
  const tr = document.querySelector(`tr[data-row-id="${CSS.escape(id)}"]`);
  if (row && tr) tr.replaceChildren(...summaryCells(row, duplicatePhones(state.rows)));
}

async function remove(row: Rsvp): Promise<void> {
  const index = state.rows.findIndex((r) => r.id === row.id);
  if (index === -1) return;

  const before = state.rows.slice();
  state.rows.splice(index, 1);
  renderDashboard();

  const { error } = await supabase.from('rsvps').delete().eq('id', row.id);

  if (error) {
    if (isAuthFailure(error)) return handleExpiredSession();
    state.rows = before;
    renderDashboard();
    toast(`Could not delete that entry. ${error.message}`, 'error');
    return;
  }

  toast(`Deleted the reply from ${row.first_name} ${row.last_name}.`);
}

/* -------------------------------------------------------------------------
   Derived views
   ------------------------------------------------------------------------- */

function visibleRows(): Rsvp[] {
  const q = state.query.trim().toLowerCase();
  /* Search over the digits too, so "6282" finds "+91 6282 …" however the
     number was typed. */
  const digits = q.replace(/\D/g, '');

  let rows = state.rows.filter((r) => {
    if (state.filter === 'coming' && !(r.attending_mass || r.attending_reception)) return false;
    if (state.filter === 'not-coming' && (r.attending_mass || r.attending_reception)) return false;
    if (state.filter === 'has-message' && !r.message?.trim()) return false;

    if (!q) return true;
    return (
      r.first_name.toLowerCase().includes(q) ||
      r.last_name.toLowerCase().includes(q) ||
      `${r.first_name} ${r.last_name}`.toLowerCase().includes(q) ||
      (digits.length > 0 && (r.phone_normalised ?? '').includes(digits))
    );
  });

  rows = rows.slice().sort((a, b) =>
    state.sort === 'party'
      ? b.party_size - a.party_size ||
        +new Date(b.created_at) - +new Date(a.created_at)
      : +new Date(b.created_at) - +new Date(a.created_at),
  );

  return rows;
}

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const received = (iso: string) => dateFormat.format(new Date(iso));

/* -------------------------------------------------------------------------
   Rendering
   ------------------------------------------------------------------------- */

function statCard(value: number, label: string, hint?: string): HTMLElement {
  return el('div', { class: 'stat' },
    el('p', { class: 'stat__value' }, String(value)),
    el('p', { class: 'stat__label' }, label),
    hint ? el('p', { class: 'stat__hint' }, hint) : null,
  );
}

function renderStats(): HTMLElement {
  const s = computeStats(state.rows);
  return el('div', { class: 'stats' },
    statCard(s.massPeople, 'Coming to the Mass', 'people'),
    statCard(s.receptionPeople, 'Coming to the Reception', 'people'),
    statCard(s.notComingEntries, 'Not coming', 'replies'),
    statCard(s.totalPeople, 'Total people expected', 'at one or both'),
    statCard(s.children, 'Children', 'under 12'),
    statCard(s.todayEntries, 'Received today', 'replies'),
  );
}

/** A labelled text input that writes back on blur, only if the value changed. */
function field(
  label: string,
  value: string | null,
  onCommit: (next: string) => void,
  opts: { type?: string; textarea?: boolean } = {},
): HTMLElement {
  const initial = value ?? '';
  const control = opts.textarea
    ? el('textarea', { class: 'admin__input admin__textarea', rows: 3 })
    : el('input', { class: 'admin__input', type: opts.type ?? 'text' });
  (control as HTMLInputElement).value = initial;

  /* Compared against the last value actually sent, not against the value the
     field was born with. A blur that follows a save is then a no-op, which is
     what stops a `blur` dispatched while this node is being torn down from
     saving the same edit a second time — and re-entering the render that tore
     it down. Repeat edits still save, because `saved` moves with them. */
  let saved = initial;
  control.addEventListener('blur', () => {
    const next = (control as HTMLInputElement).value;
    if (next === saved) return;
    saved = next;
    onCommit(next);
  });
  control.addEventListener('keydown', (event) => {
    const key = (event as KeyboardEvent).key;
    if (key === 'Escape') {
      (control as HTMLInputElement).value = initial;
      (control as HTMLElement).blur();
    }
    if (key === 'Enter' && !opts.textarea) (control as HTMLElement).blur();
  });

  return el('label', { class: 'editor__field' },
    el('span', { class: 'editor__label' }, label),
    control,
  );
}

function toggle(label: string, checked: boolean, onChange: (next: boolean) => void): HTMLElement {
  const input = el('input', {
    type: 'checkbox',
    checked,
    onchange: (event: Event) => onChange((event.target as HTMLInputElement).checked),
  });
  return el('label', { class: 'editor__toggle' }, input, el('span', {}, label));
}

function renderCompanions(row: Rsvp): HTMLElement {
  const list = row.companions ?? [];

  const editors = list.map((companion, i) =>
    el('div', { class: 'companion' },
      field('Name', companion.name, (next) => {
        const companions = list.slice();
        companions[i] = { ...companions[i], name: next.trim() };
        void patchInRow(row.id, { companions });
      }),
      el('label', { class: 'editor__field' },
        el('span', { class: 'editor__label' }, 'Age'),
        el('select', {
          class: 'admin__input',
          onchange: (event: Event) => {
            const companions = list.slice();
            companions[i] = {
              ...companions[i],
              type: (event.target as HTMLSelectElement).value as 'adult' | 'child',
            };
            void patchInRow(row.id, { companions });
          },
        },
          el('option', { value: 'adult', selected: companion.type === 'adult' }, 'Adult'),
          el('option', { value: 'child', selected: companion.type === 'child' }, 'Child (under 12)'),
        ),
      ),
      el('button', {
        class: 'admin__button admin__button--quiet',
        type: 'button',
        onclick: () => {
          /* Full re-render, unlike the field edits above: this removes one of
             the companion editors, so the panel's structure changes and the
             in-place refresh (counters + summary line only) would leave a
             stale editor on screen. */
          const companions = list.filter((_, j) => j !== i);
          void patch(row.id, { companions });
        },
      }, 'Remove'),
    ),
  );

  return el('div', { class: 'editor__block' },
    el('h3', { class: 'editor__heading' }, `Coming with them (${list.length})`),
    list.length === 0 ? el('p', { class: 'editor__empty' }, 'Nobody — replying for themselves only.') : null,
    ...editors,
  );
}

function renderExpanded(row: Rsvp): HTMLElement {
  return el('div', { class: 'editor' },
    el('div', { class: 'editor__grid' },
      field('First name', row.first_name, (v) => void patchInRow(row.id, { first_name: v.trim() })),
      field('Last name', row.last_name, (v) => void patchInRow(row.id, { last_name: v.trim() })),
      field('Phone', row.phone, (v) => void patchInRow(row.id, { phone: v.trim() }), { type: 'tel' }),
      field('Email', row.email, (v) => void patchInRow(row.id, { email: v.trim() || null }), { type: 'email' }),
    ),

    el('div', { class: 'editor__toggles' },
      toggle('Wedding Mass', row.attending_mass, (v) => void patchInRow(row.id, { attending_mass: v })),
      toggle('Reception', row.attending_reception, (v) => void patchInRow(row.id, { attending_reception: v })),
    ),

    renderCompanions(row),

    el('div', { class: 'editor__block' },
      field('Their message', row.message, (v) => void patchInRow(row.id, { message: v.trim() || null }), { textarea: true }),
    ),
    el('div', { class: 'editor__block' },
      field('Private note (not shown to anyone)', row.admin_note,
        (v) => void patchInRow(row.id, { admin_note: v.trim() || null }), { textarea: true }),
    ),

    el('div', { class: 'editor__danger' },
      el('button', {
        class: 'admin__button admin__button--danger',
        type: 'button',
        onclick: () => confirmDelete(row),
      }, 'Delete this reply'),
    ),
  );
}

function cell(label: string, ...children: (Node | string | null)[]): HTMLElement {
  /* data-label drives the stacked-card layout below 720px, where each cell
     grows its own heading instead of relying on a header row that is no
     longer beside it. */
  return el('td', { class: 'row__cell', 'data-label': label }, ...children);
}

/** The read-only summary line. Split out so it can be rebuilt on its own. */
function summaryCells(row: Rsvp, duplicates: Set<string>): HTMLElement[] {
  const isDuplicate = duplicates.has(row.phone_normalised ?? '');
  const open = state.expanded.has(row.id);

  const toggleButton = el('button', {
    class: 'row__toggle',
    type: 'button',
    'aria-expanded': String(open),
    onclick: () => {
      if (open) state.expanded.delete(row.id);
      else state.expanded.add(row.id);
      renderDashboard();
    },
  }, `${row.first_name} ${row.last_name}`);

  return [
    cell('Name',
      toggleButton,
      isDuplicate
        ? el('span', {
            class: 'row__dupe',
            title: 'Same number as another entry',
            'aria-label': 'Same number as another entry',
          }, '●')
        : null,
    ),
    cell('Phone', el('span', { class: 'row__phone' }, row.phone)),
    cell('Party', String(row.party_size)),
    cell('Mass', row.attending_mass ? 'Yes' : 'No'),
    cell('Reception', row.attending_reception ? 'Yes' : 'No'),
    cell('With them', String((row.companions ?? []).length)),
    cell('Message', row.message?.trim() ? el('span', { class: 'row__has-message' }, 'Yes') : '—'),
    cell('Received', received(row.created_at)),
  ];
}

function renderRow(row: Rsvp, duplicates: Set<string>): HTMLElement[] {
  const open = state.expanded.has(row.id);

  const main = el('tr', {
    class: `row${open ? ' row--open' : ''}`,
    'data-row-id': row.id,
  }, ...summaryCells(row, duplicates));

  if (!open) return [main];

  return [
    main,
    el('tr', { class: 'row__expansion' },
      el('td', { colspan: 8 }, renderExpanded(row)),
    ),
  ];
}

/**
 * Signed in, and the database says this account is not on the allowlist.
 *
 * A distinct screen rather than a footnote on the empty state, because the two
 * mean opposite things: one says "nobody has replied yet", the other says "you
 * cannot see the replies". Rendering the first when the second is true is how
 * somebody concludes the guest list has been lost.
 *
 * It names the actual cause, because the cause is not obvious and has bitten
 * this project three times: `private.admins.user_id` cascades on delete, so
 * deleting and recreating the admin account revokes access silently.
 */
function renderNotAllowlisted(email: string | undefined): HTMLElement {
  return el('div', { class: 'admin__empty admin__empty--denied' },
    el('p', { class: 'admin__empty-title' }, 'This account cannot see the guest list'),
    el('p', { class: 'admin__empty-body' },
      `You are signed in${email ? ` as ${email}` : ''}, but this account is not on ` +
      'the admin allowlist, so the database returns nothing. No replies have been ' +
      'lost — they are simply not visible to this account.'),
    el('p', { class: 'admin__empty-note' },
      'The usual cause is the admin account having been deleted and recreated: ' +
      'the allowlist entry is removed with it. Re-add this account from the ' +
      'Supabase SQL editor:'),
    el('pre', { class: 'admin__code' },
      "insert into private.admins (user_id, note)\nvalues ('" +
      (state.userId ?? '<your user id>') +
      "', 'admin');"),
  );
}

function renderEmpty(): HTMLElement {
  return el('div', { class: 'admin__empty' },
    el('p', { class: 'admin__empty-title' }, 'No entries yet'),
    el('p', { class: 'admin__empty-body' },
      'Replies will appear here as guests send them.'),
    /* Only reached when the allowlist probe says this account IS allowed, so
       this really is an empty guest list — the ambiguity that used to live in
       this message is now handled by renderNotAllowlisted above. */
  );
}

function renderToolbar(): HTMLElement {
  let debounce: ReturnType<typeof setTimeout>;

  const search = el('input', {
    class: 'admin__input toolbar__search',
    type: 'search',
    id: 'admin-search',
    placeholder: 'Name or phone number',
    value: state.query,
    oninput: (event: Event) => {
      const value = (event.target as HTMLInputElement).value;
      clearTimeout(debounce);
      /* 250ms, and entirely client-side over the rows already loaded. At the
         few hundred replies this list will ever hold, a round trip per
         keystroke would be slower and would fail offline. */
      debounce = setTimeout(() => {
        state.query = value;
        renderDashboard();
        document.getElementById('admin-search')?.focus();
      }, 250);
    },
  });

  const chip = (value: Filter, label: string) =>
    el('button', {
      class: `chip${state.filter === value ? ' chip--on' : ''}`,
      type: 'button',
      'aria-pressed': String(state.filter === value),
      onclick: () => { state.filter = value; renderDashboard(); },
    }, label);

  const sortSelect = el('select', {
    class: 'admin__input toolbar__sort',
    id: 'admin-sort',
    onchange: (event: Event) => {
      state.sort = (event.target as HTMLSelectElement).value as Sort;
      renderDashboard();
    },
  },
    el('option', { value: 'received', selected: state.sort === 'received' }, 'Newest first'),
    el('option', { value: 'party', selected: state.sort === 'party' }, 'Largest party first'),
  );

  return el('div', { class: 'toolbar' },
    el('div', { class: 'toolbar__row' },
      el('label', { class: 'admin__sr', for: 'admin-search' }, 'Search replies'),
      search,
      el('label', { class: 'admin__sr', for: 'admin-sort' }, 'Sort by'),
      sortSelect,
    ),
    el('div', { class: 'toolbar__chips', role: 'group', 'aria-label': 'Filter replies' },
      chip('all', 'All'),
      chip('coming', 'Coming'),
      chip('not-coming', 'Not coming'),
      chip('has-message', 'Has message'),
    ),
  );
}

function renderDashboard(): void {
  const scroll = window.scrollY;
  clear(root);

  const header = el('header', { class: 'admin__header' },
    el('div', {},
      el('h1', { class: 'admin__title' }, 'Guest list'),
      el('p', { class: 'admin__lead' },
        state.loading ? 'Loading…' : `${state.rows.length} ${state.rows.length === 1 ? 'reply' : 'replies'}`),
    ),
    el('div', { class: 'admin__header-actions' },
      el('button', {
        class: 'admin__button admin__button--quiet',
        type: 'button',
        disabled: state.rows.length === 0,
        onclick: () => downloadCsv(visibleRows()),
      }, 'Download CSV'),
      el('button', {
        class: 'admin__button admin__button--quiet',
        type: 'button',
        onclick: () => void supabase.auth.signOut(),
      }, 'Sign out'),
    ),
  );

  root.append(header);

  if (state.loading) {
    root.append(el('p', { class: 'admin__state', role: 'status' }, 'Loading replies…'));
    return;
  }

  if (state.loadFailed) {
    root.append(el('div', { class: 'admin__state' },
      el('p', {}, 'Could not load the replies.'),
      el('button', { class: 'admin__button', type: 'button', onclick: () => void loadRows() }, 'Try again'),
    ));
    return;
  }

  /* Checked before the counters: six zeroes above a "you have no access"
     message reads as a guest list that has been emptied, which is the exact
     misreading this screen exists to prevent. */
  if (state.isAdmin === false) {
    root.append(renderNotAllowlisted(state.email));
    return;
  }

  root.append(renderStats());

  if (state.rows.length === 0) {
    root.append(renderEmpty());
    return;
  }

  root.append(renderToolbar());

  const rows = visibleRows();
  const duplicates = duplicatePhones(state.rows);

  if (rows.length === 0) {
    root.append(el('p', { class: 'admin__state', role: 'status' },
      'No replies match that search.'));
    window.scrollTo({ top: scroll, behavior: 'instant' as ScrollBehavior });
    return;
  }

  const head = el('tr', {},
    ...['Name', 'Phone', 'Party', 'Mass', 'Reception', 'With them', 'Message', 'Received']
      .map((h) => el('th', { scope: 'col' }, h)),
  );

  root.append(
    el('table', { class: 'table' },
      el('thead', {}, head),
      el('tbody', {}, ...rows.flatMap((row) => renderRow(row, duplicates))),
    ),
  );

  window.scrollTo({ top: scroll, behavior: 'instant' as ScrollBehavior });
}

/* -------------------------------------------------------------------------
   Delete, behind a typed confirmation
   ------------------------------------------------------------------------- */

function confirmDelete(row: Rsvp): void {
  const expected = `${row.first_name} ${row.last_name}`.trim().toLowerCase();

  const confirm = el('button', {
    class: 'admin__button admin__button--danger',
    type: 'button',
    disabled: true,
    onclick: () => { dialog.close(); void remove(row); },
  }, 'Delete permanently');

  const input = el('input', {
    class: 'admin__input',
    id: 'confirm-name',
    autocomplete: 'off',
    /* Typing the name, not clicking OK. This row is the only record that a
       person replied — there is no backup and no undo — and a confirmation
       that can be dismissed by reflex is not a confirmation. */
    oninput: (event: Event) => {
      const typed = (event.target as HTMLInputElement).value.trim().toLowerCase();
      confirm.disabled = typed !== expected;
    },
  });

  const dialog = el('dialog', { class: 'confirm' },
    el('h2', { class: 'confirm__title' }, 'Delete this reply?'),
    el('p', { class: 'confirm__body' },
      'This cannot be undone. There is no other copy of this reply.'),
    el('label', { class: 'editor__field', for: 'confirm-name' },
      el('span', { class: 'editor__label' }, `Type “${row.first_name} ${row.last_name}” to confirm`),
      input,
    ),
    el('div', { class: 'confirm__actions' },
      el('button', {
        class: 'admin__button admin__button--quiet',
        type: 'button',
        onclick: () => dialog.close(),
      }, 'Keep it'),
      confirm,
    ),
  );

  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  input.focus();
}

/* -------------------------------------------------------------------------
   Boot
   ------------------------------------------------------------------------- */

export async function start(mount: HTMLElement): Promise<void> {
  root = mount;

  /* Fires for the initial session, for sign-in, for sign-out, and when a
     refresh fails — which is the expired-session path. One listener drives the
     whole view so the two can never disagree about who is signed in. */
  /* Whether a session has ever been seen in this page's lifetime. Without it,
     the very first visit — which delivers INITIAL_SESSION with no session —
     greets a first-time visitor with "your session has expired", which is both
     false and alarming. */
  let hadSession = false;

  supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
      hadSession = true;
      state.userId = session.user?.id;
      state.email = session.user?.email;
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') void loadRows();
      return;
    }
    state.rows = [];
    state.expanded.clear();
    /* Signing out deliberately is not an expiry, and neither is arriving
       signed out. Only a session that existed and then went away is. */
    const expired = hadSession && event !== 'SIGNED_OUT';
    hadSession = false;
    renderLogin(expired ? 'Your session has expired. Please sign in again.' : undefined);
  });

  /* onAuthStateChange delivers INITIAL_SESSION on its own, but only once the
     stored session has been read back — a tick or two after this runs. Paint
     something in the meantime rather than an empty page. */
  const { data } = await supabase.auth.getSession();
  if (!data.session) renderLogin();
}
