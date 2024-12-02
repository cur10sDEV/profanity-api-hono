import { Index } from "@upstash/vector";
import csv from "csv-parser";
import * as fs from "fs";

interface Row {
  text: string;
}

export const index = new Index({
  url: "",
  token: "",
});

export const parseCSV = (filePath: string): Promise<Row[]> => {
  return new Promise((resolve, reject) => {
    const rows: Row[] = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        rows.push(row);
      })
      .on("error", (err) => {
        console.error(err);
        reject(err);
      })
      .on("end", () => {
        resolve(rows);
      });
  });
};

const seed = async () => {
  const data = await parseCSV("../data/training_data.csv");

  const STEP = 30;
  for (let i = 0; i < data.length; i += STEP) {
    const chunk = data.slice(i, i + STEP);

    const formatted = chunk.map((row, batchIndex) => ({
      data: row.text,
      id: i + batchIndex,
      metadata: { text: row.text },
    }));

    await index.upsert(formatted);
  }
};

seed();
