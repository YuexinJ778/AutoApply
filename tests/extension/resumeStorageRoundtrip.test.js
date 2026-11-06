'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const plain = value => JSON.parse(JSON.stringify(value));

function fixture(initial = {}) {
  const stored = plain(initial);
  const writes = [];
  const context = vm.createContext({ chrome: { runtime: {}, storage: { local: {
    get(keys, callback) { callback(plain(Object.fromEntries(keys.filter(key => key in stored).map(key => [key, stored[key]])))); },
    set(value, callback) { writes.push(plain(value)); Object.assign(stored, plain(value)); callback(); }
  } } } });
  for (const file of ['storage/appDataStore.js', 'lib/dataBoundary.js', 'options/resumeFunctions.js']) {
    vm.runInContext(readFileSync(path.join(__dirname, '../../extension', file), 'utf8'), context);
  }
  return { stored, writes, store: context.Stage10AppDataStore, boundary: context.Stage11DataBoundary,
    functions: context.ResumeAiFunctions };
}

function resume(language) {
  const zh = language === 'zh';
  return {
    id: 'resume-' + language, language,
    header: {
      contact: {
        firstName: zh ? '測試' : 'Demo', lastName: zh ? '陳' : 'Chen',
        email: 'demo@example.com', phone: '555-0100', location: zh ? '台北' : 'Taipei',
        links: [{ id: 'contact-' + language, text: 'github.com/demo', order: 2 }]
      },
      links: [{ id: 'header-' + language, label: 'Portfolio', url: 'https://example.com', order: 3 }]
    },
    sections: [{ id: 'section-' + language, sectionName: zh ? '專案' : 'Projects', order: 2, waived: false,
      blocks: [{ id: 'entry-' + language, order: 4, waived: false,
        lines: [
          { id: 'title-' + language, type: 'title', text: 'AutoApply', order: 1, bold: true, italic: false },
          { id: 'date-' + language, type: 'date', text: '2026', order: 2, bold: false, italic: false },
          { id: 'subtitle-' + language, type: 'subtitle', text: zh ? '工程師' : 'Engineer', order: 3, bold: false, italic: true },
          { id: 'bullet-' + language, type: 'bullet', text: zh ? '建立本機求職工具' : 'Built a local job agent',
            order: 4, bold: true, italic: true, align: 'left' },
          { id: 'paragraph-' + language, type: 'paragraph', text: 'Hidden draft', order: 5, bold: false, italic: false, waived: true }
        ]
      }]
    }]
  };
}

function assertModernResume(actual, expected) {
  assert.equal(actual.id, expected.id);
  assert.equal(actual.language, expected.language);
  assert.deepEqual(plain(actual.header.contact), expected.header.contact);
  assert.deepEqual(plain(actual.header.links), expected.header.links);
  assert.equal(actual.sections[0].id, expected.sections[0].id);
  assert.equal(actual.sections[0].order, expected.sections[0].order);
  assert.equal(actual.sections[0].blocks[0].id, expected.sections[0].blocks[0].id);
  assert.equal(actual.sections[0].blocks[0].order, expected.sections[0].blocks[0].order);
  assert.deepEqual(plain(actual.sections[0].blocks[0].lines), expected.sections[0].blocks[0].lines);
}

test('English and Chinese editor resumes survive store save and a fresh boundary load without losing typed lines or contacts', async () => {
  const original = { appDataV1: { applications: [{ notes: 'Keep legacy application unchanged.' }] } };
  const first = fixture(original);
  const resumes = { en: resume('en'), zh: resume('zh') };
  await first.store.saveAppData({ activeResumeLanguage: 'zh', resumes });
  const reopened = fixture(first.stored);
  const loaded = await reopened.boundary.getAppData();
  assert.equal(loaded.activeResumeLanguage, 'zh');
  for (const language of ['en', 'zh']) assertModernResume(loaded.resumes[language], resumes[language]);
  assert.deepEqual(first.stored.appDataV1, original.appDataV1);
  assert.equal('applications' in first.stored.profileDataV2, false);
});

test('boundary save and reload retain stable IDs for subsequent ResumeFunctions edits in either language', async () => {
  const first = fixture();
  const resumes = { en: resume('en'), zh: resume('zh') };
  await first.boundary.saveAppData({ activeResumeLanguage: 'en', resumes });
  const reopened = fixture(first.stored);
  const loaded = await reopened.boundary.getAppData();
  for (const language of ['en', 'zh']) {
    assertModernResume(loaded.resumes[language], resumes[language]);
    const changed = reopened.functions.executeResumeFunctions([{ name: 'setLine', args: {
      sectionId: 'section-' + language, entryId: 'entry-' + language, lineId: 'bullet-' + language,
      text: 'Updated ' + language
    } }], loaded.resumes[language]);
    assert.equal(changed.ok, true);
    loaded.resumes[language] = changed.resumeState;
  }
  await reopened.boundary.saveAppData({ resumes: loaded.resumes });
  const final = await fixture(reopened.stored).boundary.getAppData();
  for (const language of ['en', 'zh']) {
    const lines = final.resumes[language].sections[0].blocks[0].lines;
    assert.equal(lines.find(line => line.id === 'bullet-' + language).text, 'Updated ' + language);
    assert.equal(lines.find(line => line.id === 'paragraph-' + language).waived, true);
  }
});

test('existing full canonical Console resumes take precedence over a previously stripped mirror and its active language', async () => {
  const resumes = { en: resume('en'), zh: resume('zh') };
  const initial = {
    profileDataV2: { activeResumeLanguage: 'en', profile: { email: 'current@example.com' },
      settings: { profileResumeDataResetVersion: '2026-04-27-clean-profile-resume' },
      resumes: { en: { id: resumes.en.id, sections: [{ blocks: [{}] }] }, zh: { id: resumes.zh.id, sections: [] } } },
    stage11ProfileDataV1: { activeResumeLanguage: 'zh', resumes }
  };
  const f = fixture(initial);
  const loaded = await f.boundary.getAppData();
  assert.equal(loaded.activeResumeLanguage, 'zh');
  assert.equal(loaded.profile.email, 'current@example.com');
  for (const language of ['en', 'zh']) assertModernResume(loaded.resumes[language], resumes[language]);
  assert.deepEqual(f.stored, initial);
  assert.equal(f.writes.length, 0);
});

test('legacy resume header fields, bullets and waivers keep their original storage contract', async () => {
  const f = fixture();
  await f.store.saveAppData({ resumes: { en: {
    header: { name: { firstName: 'Legacy', lastName: 'Applicant', waived: true },
      email: { value: 'legacy@example.com', waived: true }, github: { value: 'github.com/legacy', waived: false } },
    sections: [{ id: 'legacy-section', waived: true, blocks: [{ id: 'legacy-block', waived: true,
      title: { value: 'Legacy title', waived: false }, date: '2025', subtitle: 'Legacy role',
      bullets: [{ id: 'legacy-bullet', value: 'Legacy bullet', order: 7, waived: true }], description: 'Legacy paragraph'
    }] }]
  } } });
  const loaded = (await fixture(f.stored).store.getAppData()).resumes.en;
  assert.deepEqual(plain(loaded.header.name), { firstName: 'Legacy', middleName: '', lastName: 'Applicant', waived: true });
  assert.deepEqual(plain(loaded.header.email), { value: 'legacy@example.com', waived: true });
  assert.equal(loaded.sections[0].waived, true);
  const block = loaded.sections[0].blocks[0];
  assert.equal(block.waived, true);
  assert.deepEqual(plain(block.title), { value: 'Legacy title', waived: false });
  assert.deepEqual(plain(block.bullets), [{ id: 'legacy-bullet', value: 'Legacy bullet', order: 7, waived: true }]);
  assert.deepEqual(plain(block.lines), []);
});
