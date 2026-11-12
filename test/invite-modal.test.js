import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inviteModalBox, combinePresence } from '../src/core/handlers/util.js';
import { climb, matchLabel, norm } from '../src/core/dom/query.js';

// DOM palsu minimal: cukup parentElement/children/textContent/closest untuk inviteModalBox.
class El {
  constructor(tag, attrs = {}, ...kids) {
    this.tagName = tag.toUpperCase();
    this.attrs = attrs;
    this.parentElement = null;
    this.children = [];
    this.text = '';
    for (const k of kids) {
      if (typeof k === 'string') this.text += k;
      else {
        k.parentElement = this;
        this.children.push(k);
      }
    }
  }
  get textContent() {
    return this.text + this.children.map((c) => c.textContent).join('');
  }
  getAttribute(a) {
    return this.attrs[a] ?? null;
  }
  matches(sel) {
    return sel.split(',').some((raw) => {
      const s = raw.trim();
      const m = /^([a-z]*)(?:\[([a-z-]+)(?:="([^"]*)")?\])?$/i.exec(s);
      if (!m) return false;
      const [, tag, attr, val] = m;
      if (tag && tag.toUpperCase() !== this.tagName) return false;
      if (attr && (val === undefined ? this.attrs[attr] == null : this.attrs[attr] !== val)) return false;
      return true;
    });
  }
  closest(sel) {
    for (let p = this; p; p = p.parentElement) if (p.matches(sel)) return p;
    return null;
  }
  *all() {
    for (const c of this.children) {
      yield c;
      yield* c.all();
    }
  }
}
const h = (tag, attrs, ...kids) => new El(tag, attrs, ...kids);
const btn = (label) => h('button', {}, h('span', {}, label));

/**
 * dom palsu. `leafBug` meniru temuan live: findLeaf('undang teman') mengembalikan TOMBOL lobby.
 */
function fakeDom(body, { leafBug = false } = {}) {
  const buttonsIn = (root) => [...root.all()].filter((e) => e.tagName === 'BUTTON');
  const findButton = (m, root = body) => buttonsIn(root).find((b) => matchLabel(m, norm(b.textContent), b)) ?? null;
  return {
    climb,
    findButton,
    findLeaf(m, root = body) {
      for (const el of root.all()) {
        if (!matchLabel(m, norm(el.textContent), el)) continue;
        if (el.tagName === 'BUTTON') {
          if (leafBug) return el;
          continue;
        }
        if (!leafBug && el.closest('button')) continue;
        if (el.children.some((c) => matchLabel(m, norm(c.textContent), c))) continue;
        return el;
      }
      return null;
    },
  };
}

function lobby({ modalOpen, dialogRole = false }) {
  const rules = h('div', {}, h('h3', {}, 'Aturan main'), btn('Selesai'), btn('Tutup'));
  const controls = h('div', {}, btn('Bagikan link'), btn('Undang teman'), btn('Atur'), btn('Mulai main'));
  const players = h('ul', {}, h('li', {}, 'ilramdhan.dev'));
  const room = h('main', {}, controls, players, rules);
  const modal = modalOpen
    ? h(
        'div',
        dialogRole ? { role: 'dialog' } : {},
        h('h2', {}, 'Undang teman'),
        h('p', {}, 'Teman yang online dan tidak sedang main.'),
        h('div', {}, h('span', {}, 'JULE'), h('span', {}, 'Online'), btn('Undang')),
        btn('Tutup'),
      )
    : null;
  const body = h('body', {}, room, ...(modal ? [modal] : []));
  return { body, modal };
}

for (const leafBug of [false, true]) {
  const tag = leafBug ? ' (findLeaf kena tombol lobby)' : '';

  test(`inviteModalBox: modal tertutup → null, walau lobby punya tombol "Undang teman" & "Tutup" lain${tag}`, () => {
    const { body } = lobby({ modalOpen: false });
    assert.equal(inviteModalBox(fakeDom(body, { leafBug })), null);
  });

  test(`inviteModalBox: modal terbuka → kontainer modal, bukan BODY${tag}`, () => {
    const { body, modal } = lobby({ modalOpen: true });
    const box = inviteModalBox(fakeDom(body, { leafBug }));
    assert.equal(box, modal);
    assert.notEqual(box.tagName, 'BODY');
  });
}

test('inviteModalBox: pakai [role=dialog] bila ada', () => {
  const { body, modal } = lobby({ modalOpen: true, dialogRole: true });
  assert.equal(inviteModalBox(fakeDom(body)), modal);
});

test('inviteModalBox: "Tutup" yang ditemukan ada di dalam modal, bukan panel Aturan main', () => {
  const { body, modal } = lobby({ modalOpen: true });
  const dom = fakeDom(body);
  const close = dom.findButton('tutup', inviteModalBox(dom));
  assert.equal(close.parentElement, modal);
});

test('combinePresence: nama dari game.players dihitung hadir, nama di modal undang tidak', () => {
  // texts sudah tanpa modal; "JULE" hanya ada di modal → tidak hadir kecuali ada di game.players.
  assert.deepEqual(combinePresence({ others: ['JULE'], texts: ['ilramdhan.dev'] }).missing, ['JULE']);
  const r = combinePresence({ others: ['JULE'], texts: ['ilramdhan.dev'], players: ['ilramdhan.dev', 'jule'] });
  assert.deepEqual(r.present, ['JULE']);
  assert.equal(r.count, 2);
});
