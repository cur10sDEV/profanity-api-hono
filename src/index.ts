import { Index } from "@upstash/vector";
import { Hono } from "hono";
import { env } from "hono/adapter";
import { EnvironmentVars } from "./types";
import { splitTextIntoSemantics, splitTextIntoWords } from "./utils/splitters";

const app = new Hono();

// words that inappropriately gets flagged as profanity even though they are not
const WHITELIST = ["swear"];
const PROFANITY_THRESHOLD = 0.86;

app.post("/", async (c) => {
  if (c.req.header("Content-Type") !== "application/json") {
    return c.json({ error: "JSON body expected" }, 406);
  }

  try {
    const { VECTOR_URL, VECTOR_TOKEN } = env<EnvironmentVars>(c);

    const index = new Index({
      url: VECTOR_URL,
      token: VECTOR_TOKEN,
      cache: false, // cache does not work with cloudflare workers
    });

    const body = await c.req.json();

    let { message } = body as { message: string };

    if (!message) {
      return c.json({ error: "Message argument is undefine" }, 400);
    }

    if (message.length > 1000) {
      return c.json(
        { error: "Message can only be at most 1000 characters" },
        413
      );
    }

    // exclude safe words
    message = message
      .split(/\s/)
      .filter((word) => !WHITELIST.includes(word.toLowerCase()))
      .join(" ");

    const [wordChunks, semanticChunks] = await Promise.all([
      splitTextIntoWords(message),
      splitTextIntoSemantics(message),
    ]);

    const flaggedFor = new Set<{ score: number; text: string }>();

    const vectorRes = await Promise.all([
      ...wordChunks.map(async (wordChunk) => {
        const [vector] = await index.query({
          topK: 1,
          data: wordChunk,
          includeMetadata: true,
        });

        if (vector && vector.score > 0.95) {
          flaggedFor.add({
            text: vector.metadata!.text as string,
            score: vector.score,
          });
        }

        return { score: 0 };
      }),
      ...semanticChunks.map(async (semanticChunk) => {
        const [vector] = await index.query({
          topK: 1,
          data: semanticChunk,
          includeMetadata: true,
        });

        if (vector && vector.score > PROFANITY_THRESHOLD) {
          flaggedFor.add({
            text: vector.metadata!.text as string,
            score: vector.score,
          });
        }

        return { score: 0 };
      }),
    ]);

    if (flaggedFor.size > 0) {
      const sorted = Array.from(flaggedFor).sort((a, b) =>
        a.score > b.score ? 1 : -1
      )[0];

      return c.json({
        isProfanity: true,
        score: sorted.score,
        flaggedFor: sorted.text,
      });
    } else {
      const mostProfaneChunk = vectorRes.sort((a, b) =>
        a.score > b.score ? 1 : -1
      )[0];

      return c.json({
        isProfanity: false,
        score: mostProfaneChunk.score,
      });
    }
  } catch (error) {
    console.error(error);

    return c.json(
      {
        error: "Something went wrong",
      },
      500
    );
  }
});

export default app;
