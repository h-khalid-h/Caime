/**
 * Word, Excel and PowerPoint files for the tests (M16 H6): real zips, written here with Node's
 * own deflate and checksum, holding only the parts the server reads. `zipOf` may lie about a
 * part's size, as a zip bomb does.
 */
import { crc32, deflateRawSync } from 'node:zlib';

/** A zip of these parts, deflated; `liesAbout` names a part whose size it gives as 10 bytes. */
export function zipOf(parts: Record<string, string | Buffer>, liesAbout?: string): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(parts)) {
    const data = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    const packed = deflateRawSync(data);
    const nameBytes = Buffer.from(name, 'utf8');
    const size = name === liesAbout ? 10 : data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, packed);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(parts).length, 8);
  end.writeUInt16LE(Object.keys(parts).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

export const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** A letter: a title, a heading, a paragraph with marks to escape, a table, and Arabic. */
export const letterDocx = () =>
  zipOf({
    '[Content_Types].xml': '<Types/>',
    'word/document.xml': `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>
<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Before your visit</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Allergies</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Tell us </w:t></w:r><w:r><w:t>about &lt;script&gt;alert(1)&lt;/script&gt; &amp; medicines.</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Name</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Dose</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>Aspirin</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>100 mg</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:p><w:r><w:t>مرحبا بك</w:t></w:r></w:p>
</w:body></w:document>`,
  });

/** A workbook: shared words, a day, a number, a yes, words in the cell, and an empty sheet. */
export const patientsXlsx = () =>
  zipOf({
    'xl/workbook.xml':
      '<workbook><sheets><sheet name="Patients" sheetId="1" r:id="rId1"/><sheet name="Empty" sheetId="2" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
    'xl/sharedStrings.xml':
      '<sst><si><t>Name</t></si><si><t>Born</t></si><si><r><t>Lina</t></r><r><t xml:space="preserve"> Farah</t></r></si></sst>',
    'xl/styles.xml':
      '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml':
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="2"><v>32970</v></c><c r="D2"><v>12.5</v></c><c r="E2" t="b"><v>1</v></c><c r="F2" t="inlineStr"><is><t>note</t></is></c></row></sheetData></worksheet>',
    'xl/worksheets/sheet2.xml': '<worksheet><sheetData/></worksheet>',
  });

/** A deck of two slides. */
export const resultsPptx = () =>
  zipOf({
    'ppt/presentation.xml':
      '<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/></p:sldIdLst></p:presentation>',
    'ppt/_rels/presentation.xml.rels':
      '<Relationships><Relationship Id="rId2" Target="slides/slide1.xml"/><Relationship Id="rId3" Target="slides/slide2.xml"/></Relationships>',
    'ppt/slides/slide1.xml':
      '<p:sld><a:p><a:r><a:t>Q3 results</a:t></a:r></a:p><a:p><a:r><a:t>Up 12%</a:t></a:r><a:br/><a:r><a:t>in Cairo</a:t></a:r></a:p></p:sld>',
    'ppt/slides/slide2.xml': '<p:sld><a:p><a:r><a:t>Thanks</a:t></a:r></a:p></p:sld>',
  });
