/**
 * Dump isi workbook Excel (semua sheet, semua sel tak kosong) ke stdout.
 * Jalankan: node scripts/dump-hpp.mjs "path/ke/file.xlsx"
 */
import ExcelJS from "exceljs";

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/dump-hpp.mjs "file.xlsx"');
  process.exit(1);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);

for (const ws of wb.worksheets) {
  console.log(`\n=== SHEET: ${ws.name} (${ws.rowCount} baris) ===`);
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells = [];
    row.eachCell({ includeEmpty: false }, (cell) => {
      let v = cell.value;
      let text = "";
      if (v === null || v === undefined) {
        text = "";
      } else if (v instanceof Date) {
        text = v.toISOString().slice(0, 10);
      } else if (typeof v === "object" && "richText" in v) {
        text = v.richText.map((t) => t.text).join("");
      } else if (typeof v === "object" && "text" in v) {
        text = String(v.text);
      } else if (typeof v === "object" && "result" in v) {
        text = v.result === null || v.result === undefined ? "" : String(v.result);
      } else {
        text = String(v);
      }
      if (text !== "") cells.push(`${cell.address}:${text}`);
    });
    if (cells.length) console.log(`R${rowNumber} | ${cells.join(" | ")}`);
  });
}
