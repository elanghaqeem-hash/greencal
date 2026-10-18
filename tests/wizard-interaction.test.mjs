import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = source.indexOf("function renderWizard() {");
const end = source.indexOf("function renderWzListrik(", start);
assert.ok(start > -1 && end > start, "Wizard renderer should exist");
const wizardSource = source.slice(start, end);
const types = ["listrik","bbm","ac","dinas","debitur","surat-berharga"];

function setup() {
  const cards = types.map(wz => ({
    dataset: {wz},
    attributes: {},
    tabIndex: -1,
    setAttribute(name, value) {this.attributes[name] = value;},
    classList: {
      active:false,
      toggle(name, value){if(name==="active")this.active=value;}
    },
    click(){this.onclick();}
  }));
  const state = {wz:"listrik",securityEditId:"existing"};
  const panel = {};
  const screens = [];
  const $$ = selector => {
    assert.equal(selector, ".wizard-card");
    return cards;
  };
  const $ = selector => {
    assert.equal(selector, "#wizardFormPanel");
    return panel;
  };
  const renderer = name => node => {screens.push(name); node.current = name;};
  const fn = new Function("$$","$","S", ...types.map((_, i) => "render" + i),
    wizardSource.replaceAll("renderWzListrik(", "render0(")
      .replaceAll("renderWzBbm(", "render1(")
      .replaceAll("renderWzAc(", "render2(")
      .replaceAll("renderWzDinas(", "render3(")
      .replaceAll("renderWzDebitur(", "render4(")
      .replaceAll("renderWzSecurities(", "render5(")
      + "return renderWizard;");
  const renderWizard = fn($$,$,state,...types.map(renderer));
  return {cards,state,panel,screens,renderWizard};
}

test("uses all wizard cards, not only one querySelector element", () => {
  assert.match(wizardSource, /\$\$\("\.wizard-card"\)\.forEach/);
  assert.doesNotMatch(wizardSource, /(?<!\$)\$\("\.wizard-card"\)\.forEach/);
  const obj=setup();
  assert.doesNotThrow(obj.renderWizard);
  assert.equal(obj.panel.current,"listrik");
  assert.equal(obj.cards.filter(c=>c.classList.active).length,1);
});

test("each card click renders the correct live form", () => {
  const obj=setup();
  obj.renderWizard();
  for(const card of obj.cards){
    card.click();
    assert.equal(obj.state.wz,card.dataset.wz);
    assert.equal(obj.panel.current,card.dataset.wz);
    assert.equal(obj.cards.filter(c=>c.classList.active).length,1);
    assert.equal(card.attributes["aria-pressed"],"true");
    assert.equal(card.attributes.role,"button");
    assert.equal(card.tabIndex,0);
  }
});

test("keyboard enter/space activates cards and edit resets on exit", () => {
  const obj=setup();
  obj.renderWizard();
  const ev = key => ({key,preventDefault() {this.prevented=true;}});
  const target=obj.cards.at(-1);
  target.onkeydown(ev("Enter"));
  assert.equal(obj.state.wz,"surat-berharga");
  obj.cards[4].onkeydown(ev(" "));
  assert.equal(obj.state.wz,"debitur");
  assert.equal(obj.state.securityEditId,null);
});
