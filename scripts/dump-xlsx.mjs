/**
 * Dump isi workbook Excel (semua sheet, semua sel) ke stdout.
 * Jalankan: node scripts/dump-xlsx.mjs "path/ke/file.xlsx" [maxBaris]
 */
import ExcelJS from "exceljs";

const file = process.argv[2];
const maxRows = Number(process.argv[3] ?? 200);
if (!file) {
  console.error('Usage: node scripts/dump-xlsx.mjs "file.xlsx" [maxRows]');
  process.exit(1);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);

for (const ws of wb.worksheets) {
  console.log(`\n=== SHEET: ${ws.name} (${ws.rowCount} baris) ===`);
  ws.eachRow((row, rowNum) => {
    if (rowNum > maxRows) return;
    const cells = [];
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      const v = cell.value;
      let text = "";
      if (v === null || v === undefined) text = "";
      else if (typeof v === "object" && "result" in v) text = String(v.result);
      else if (typeof v === "object" && "richText" in v) text = v.richText.map((r) => r.text).join("");
      else if (v instanceof Date) text = v.toISOString();
      else text = String(v);
      cells.push(`${colNum}:${text.trim()}`);
    });
    console.log(`R${rowNum} | ${cells.filter((c) => !c.endsWith(":")).join(" | ")}`);
  });
}
