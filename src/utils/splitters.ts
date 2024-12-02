import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

const semanticSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 25,
  separators: [" "],
  chunkOverlap: 12,
});

export const splitTextIntoWords = (text: string) => {
  return text.split(/\s\+/);
};

// group some words together to make a chunk
export const splitTextIntoSemantics = async (text: string) => {
  if (text.split(/\s/).length === 0) {
    return [];
  }

  const documents = await semanticSplitter.createDocuments([text]);
  const chunks = documents.map((chunk) => chunk.pageContent);
  return chunks;
};
