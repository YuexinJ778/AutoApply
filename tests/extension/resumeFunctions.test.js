const assert = require('node:assert/strict');
const test = require('node:test');

require('../../extension/options/resumeFunctions.js');
const { executeResumeFunctions, validateResumeFunctionBatch } = globalThis.ResumeAiFunctions;

function fixture() {
  return {
    language: 'en',
    header: {
      name: { firstName: 'Demo', lastName: 'Applicant' },
      email: { value: 'demo.applicant@example.com', waived: false },
      contact: {
        firstName: 'Demo', lastName: 'Applicant', email: 'demo.applicant@example.com',
        phone: '+1-202-555-0147', location: 'Remote',
        links: [
          { id: 'link1', text: 'example.com/portfolio', order: 1 },
          { id: 'link2', text: 'example.com/project', order: 2 }
        ]
      }
    },
    sections: [
      {
        id: 's1', sectionName: 'Experience', order: 1,
        blocks: [
          {
            id: 'e1', order: 1,
            lines: [
              { id: 'l1', type: 'title', text: 'Engineer', bold: true, italic: false, order: 1 },
              { id: 'l2', type: 'bullet', text: 'Built a workflow.', bold: false, italic: false, order: 2 }
            ]
          },
          {
            id: 'e2', order: 2,
            lines: [{ id: 'l3', type: 'title', text: 'Intern', bold: true, italic: false, order: 1 }]
          }
        ]
      },
      {
        id: 's2', sectionName: 'Education', order: 2,
        blocks: [{ id: 'e3', order: 1, lines: [{ id: 'l4', type: 'title', text: 'B.S. Computer Science', order: 1 }] }]
      }
    ]
  };
}

function call(name, args) {
  return { name, args };
}

function success(calls, original = fixture()) {
  const result = executeResumeFunctions(calls, original);
  assert.equal(result.ok, true, result.error);
  return result;
}

test('rejects malformed batches, calls, and argument objects', () => {
  const malformed = [
    null, 'setContactField', {}, [null], [42],
    [call('setContactField', null)], [call('setContactField', [])]
  ];
  for (const calls of malformed) {
    const result = validateResumeFunctionBatch(calls, fixture());
    assert.equal(result.ok, false);
    assert.equal(typeof result.error, 'string');
  }
});

test('rejects an operation outside the allowlist', () => {
  const result = validateResumeFunctionBatch([call('replaceResume', {})], fixture());
  assert.equal(result.ok, false);
  assert.match(result.error, /Unknown function/);
});

test('accepts ten calls and rejects an eleven-call batch', () => {
  const calls = Array.from({ length: 10 }, (_, i) => call('setContactField', { field: 'firstName', value: `Demo ${i}` }));
  assert.equal(success(calls).resumeState.header.contact.firstName, 'Demo 9');
  const result = executeResumeFunctions([...calls, calls[0]], fixture());
  assert.equal(result.ok, false);
  assert.equal(result.appliedCount, 0);
  assert.match(result.error, /at most 10/);
});

test('rejects complete resume and profile/application payloads, including nested objects', () => {
  const payloads = [
    { resume: {} }, { resumeJson: {} }, { resumeJSON: {} }, { resumeState: {} },
    { fullResume: {} }, { profile: {} }, { application: {} },
    { extra: { profile: {} } }, { extra: { header: {}, sections: [] } }
  ];
  for (const payload of payloads) {
    const result = validateResumeFunctionBatch([
      call('setContactField', { field: 'firstName', value: 'Changed', ...payload })
    ], fixture());
    assert.equal(result.ok, false);
    assert.match(result.error, /must not include/);
  }
});

test('rejects contact fields outside the supported set', () => {
  const result = validateResumeFunctionBatch([call('setContactField', { field: 'password', value: 'ignored' })], fixture());
  assert.equal(result.ok, false);
  assert.match(result.error, /Unknown contact field/);
});

test('reports missing section, entry, line, and contact-link targets', () => {
  const cases = [
    [call('setSection', { sectionId: 'missing', name: 'Projects' }), 'SECTION_NOT_FOUND', 'section'],
    [call('deleteEntry', { sectionId: 's1', entryId: 'missing' }), 'ENTRY_NOT_FOUND', 'entry'],
    [call('deleteLine', { sectionId: 's1', entryId: 'e1', lineId: 'missing' }), 'LINE_NOT_FOUND', 'line'],
    [call('deleteContactLink', { linkId: 'missing' }), 'LINK_NOT_FOUND', 'link']
  ];
  for (const [operation, code, missingType] of cases) {
    const result = executeResumeFunctions([operation], fixture());
    assert.equal(result.ok, false);
    assert.equal(result.targetNotFound, true);
    assert.equal(result.code, code);
    assert.equal(result.missingType, missingType);
    assert.equal(result.missingId, 'missing');
    assert.deepEqual(result.failedCall, operation);
  }
});

test('rejects unsupported line types and move directions', () => {
  const invalid = [
    call('addLine', { sectionId: 's1', entryId: 'e1', type: 'heading', text: 'Heading' }),
    call('setLine', { sectionId: 's1', entryId: 'e1', lineId: 'l1', type: 'heading' }),
    call('moveSection', { sectionId: 's1', direction: 'left' }),
    call('moveEntry', { sectionId: 's1', entryId: 'e1', direction: 'left' }),
    call('moveLine', { sectionId: 's1', entryId: 'e1', lineId: 'l1', direction: 'left' })
  ];
  for (const operation of invalid) {
    assert.equal(validateResumeFunctionBatch([operation], fixture()).ok, false);
  }
});

test('rejects unavailable creation references and a last-entry reference in another section', () => {
  const invalid = [
    [call('addEntry', { sectionId: '$lastSection' })],
    [call('addLine', { sectionId: 's1', entryId: '$lastEntry', type: 'bullet', text: 'Example' })],
    [
      call('addEntry', { sectionId: 's1' }),
      call('addLine', { sectionId: 's2', entryId: '$lastEntry', type: 'bullet', text: 'Example' })
    ]
  ];
  for (const calls of invalid) {
    const result = validateResumeFunctionBatch(calls, fixture());
    assert.equal(result.ok, false);
    assert.equal(result.targetNotFound, true);
  }
});

test('setContactField updates contact values and their resume-header counterparts', () => {
  const result = success([
    call('setContactField', { field: 'firstName', value: 'Taylor' }),
    call('setContactField', { field: 'email', value: 'taylor@example.com' })
  ]);
  assert.equal(result.resumeState.header.contact.firstName, 'Taylor');
  assert.equal(result.resumeState.header.name.firstName, 'Taylor');
  assert.equal(result.resumeState.header.contact.email, 'taylor@example.com');
  assert.deepEqual(result.resumeState.header.email, { value: 'taylor@example.com', waived: false });
});

test('addContactLink appends an ordered plain-text link', () => {
  const result = success([call('addContactLink', { text: 'example.com/new-project' })]);
  const link = result.resumeState.header.contact.links.at(-1);
  assert.equal(link.text, 'example.com/new-project');
  assert.equal(link.order, 3);
  assert.ok(link.id);
});

test('deleteContactLink removes the selected link and reindexes survivors', () => {
  const result = success([call('deleteContactLink', { linkId: 'link1' })]);
  assert.deepEqual(result.resumeState.header.contact.links, [{ id: 'link2', text: 'example.com/project', order: 1 }]);
});

test('addSection appends an empty section and exposes its created ID', () => {
  const result = success([call('addSection', { name: 'Projects' })]);
  const section = result.resumeState.sections.at(-1);
  assert.equal(section.id, result.lastSectionId);
  assert.ok(section.id);
  assert.equal(section.sectionName, 'Projects');
  assert.equal(section.order, 3);
  assert.deepEqual(section.blocks, []);
});

test('setSection renames the selected section while preserving its entries', () => {
  const original = fixture();
  const result = success([call('setSection', { sectionId: 's1', name: 'Work Experience' })], original);
  assert.equal(result.resumeState.sections[0].sectionName, 'Work Experience');
  assert.deepEqual(result.resumeState.sections[0].blocks, original.sections[0].blocks);
});

test('deleteSection removes its content and reindexes remaining sections', () => {
  const result = success([call('deleteSection', { sectionId: 's1' })]);
  assert.deepEqual(result.resumeState.sections.map(section => [section.id, section.order]), [['s2', 1]]);
  assert.equal(result.resumeState.sections[0].blocks[0].id, 'e3');
});

test('moveSection changes section order without losing entries', () => {
  const result = success([call('moveSection', { sectionId: 's2', direction: 'up' })]);
  assert.deepEqual(result.resumeState.sections.map(section => [section.id, section.order]), [['s2', 1], ['s1', 2]]);
  assert.equal(result.resumeState.sections[1].blocks[0].id, 'e1');
});

test('addEntry appends an empty ordered entry and exposes its created ID', () => {
  const result = success([call('addEntry', { sectionId: 's1' })]);
  const entry = result.resumeState.sections[0].blocks.at(-1);
  assert.equal(entry.id, result.lastEntryId);
  assert.ok(entry.id);
  assert.equal(entry.order, 3);
  assert.deepEqual(entry.lines, []);
});

test('deleteEntry removes the selected entry and reindexes survivors', () => {
  const result = success([call('deleteEntry', { sectionId: 's1', entryId: 'e1' })]);
  assert.deepEqual(result.resumeState.sections[0].blocks.map(entry => [entry.id, entry.order]), [['e2', 1]]);
});

test('moveEntry reorders entries within its section', () => {
  const result = success([call('moveEntry', { sectionId: 's1', entryId: 'e2', direction: 'up' })]);
  assert.deepEqual(result.resumeState.sections[0].blocks.map(entry => [entry.id, entry.order]), [['e2', 1], ['e1', 2]]);
});

test('addLine preserves text and enforces title/subtitle formatting', () => {
  const result = success([
    call('addLine', { sectionId: 's1', entryId: 'e1', type: 'title', text: 'Example Project', bold: false }),
    call('addLine', { sectionId: 's1', entryId: 'e1', type: 'subtitle', text: 'Example Labs', italic: false })
  ]);
  const lines = result.resumeState.sections[0].blocks[0].lines;
  assert.equal(lines[2].text, 'Example Project');
  assert.equal(lines[2].bold, true);
  assert.equal(lines[2].order, 3);
  assert.equal(lines[3].text, 'Example Labs');
  assert.equal(lines[3].italic, true);
  assert.equal(lines[3].order, 4);
});

test('setLine edits an existing line and applies formatting for its new type', () => {
  const result = success([call('setLine', { sectionId: 's1', entryId: 'e1', lineId: 'l2', type: 'title', text: 'Updated title', bold: false })]);
  const line = result.resumeState.sections[0].blocks[0].lines[1];
  assert.equal(line.id, 'l2');
  assert.equal(line.type, 'title');
  assert.equal(line.text, 'Updated title');
  assert.equal(line.bold, true);
});

test('deleteLine removes the selected line and reindexes survivors', () => {
  const result = success([call('deleteLine', { sectionId: 's1', entryId: 'e1', lineId: 'l1' })]);
  assert.deepEqual(result.resumeState.sections[0].blocks[0].lines.map(line => [line.id, line.order]), [['l2', 1]]);
});

test('moveLine reorders lines within its entry', () => {
  const result = success([call('moveLine', { sectionId: 's1', entryId: 'e1', lineId: 'l2', direction: 'up' })]);
  assert.deepEqual(result.resumeState.sections[0].blocks[0].lines.map(line => [line.id, line.order]), [['l2', 1], ['l1', 2]]);
});

test('creation references connect a new section, entry, and line in one batch', () => {
  const result = success([
    call('addSection', { name: 'Projects' }),
    call('addEntry', { sectionId: '$lastSection' }),
    call('addLine', { sectionId: '$lastSection', entryId: '$lastEntry', type: 'bullet', text: 'Built a validated workflow.' })
  ]);
  const section = result.resumeState.sections.at(-1);
  const entry = section.blocks[0];
  assert.equal(section.id, result.lastSectionId);
  assert.equal(entry.id, result.lastEntryId);
  assert.equal(entry.lines[0].text, 'Built a validated workflow.');
});

test('a successful batch preserves the input and returns independent nested objects', () => {
  const original = fixture();
  const before = structuredClone(original);
  const result = success([call('setContactField', { field: 'firstName', value: 'Taylor' })], original);
  assert.notStrictEqual(result.resumeState, original);
  assert.notStrictEqual(result.resumeState.header.contact.links, original.header.contact.links);
  assert.notStrictEqual(result.resumeState.sections[1].blocks[0].lines[0], original.sections[1].blocks[0].lines[0]);
  result.resumeState.header.contact.links[0].text = 'example.com/output-only';
  result.resumeState.sections[1].blocks[0].lines[0].text = 'Changed only in output';
  assert.deepEqual(original, before);
});

test('a validation failure returns the original resume without applying an earlier valid call', () => {
  const original = fixture();
  const before = structuredClone(original);
  const result = executeResumeFunctions([
    call('setContactField', { field: 'firstName', value: 'Taylor' }),
    call('replaceResume', {})
  ], original);
  assert.equal(result.ok, false);
  assert.equal(result.appliedCount, 0);
  assert.strictEqual(result.resumeState, original);
  assert.deepEqual(original, before);
});

test('a later execution failure returns the original resume and discards earlier edits', () => {
  const original = fixture();
  const before = structuredClone(original);
  const calls = [
    call('setContactField', { field: 'firstName', value: 'Taylor' }),
    call('deleteSection', { sectionId: 's1' }),
    call('setSection', { sectionId: 's1', name: 'Updated experience' })
  ];
  assert.equal(validateResumeFunctionBatch(calls, original).ok, true);
  const result = executeResumeFunctions(calls, original);
  assert.equal(result.ok, false);
  assert.equal(result.appliedCount, 2);
  assert.equal(result.code, 'SECTION_NOT_FOUND');
  assert.strictEqual(result.resumeState, original);
  assert.deepEqual(original, before);
});

test('moving the first item up leaves section, entry, and line order unchanged', () => {
  const original = fixture();
  const result = success([
    call('moveSection', { sectionId: 's1', direction: 'up' }),
    call('moveEntry', { sectionId: 's1', entryId: 'e1', direction: 'up' }),
    call('moveLine', { sectionId: 's1', entryId: 'e1', lineId: 'l1', direction: 'up' })
  ], original);
  assert.deepEqual(result.resumeState, original);
});
