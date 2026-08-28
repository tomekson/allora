import Fastify from "fastify";
import { z } from "zod";
import { prisma } from "./lib/prisma.js";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok" }));

const shopsQuerySchema = z.object({
  method: z.string().optional(), // přesný název metody, např. "PayPal"
  country: z.string().optional(),
  alt: z.coerce.boolean().optional(), // jen obchody s aspoň jednou alternativní metodou
});

app.get("/api/shops", async (request, reply) => {
  const query = shopsQuerySchema.safeParse(request.query);
  if (!query.success) {
    return reply.status(400).send({ error: "Neplatné parametry", issues: query.error.issues });
  }
  const { method, country, alt } = query.data;

  const shops = await prisma.shop.findMany({
    where: {
      active: true,
      ...(country ? { country: country as never } : {}),
      ...(method
        ? { paymentOptions: { some: { paymentMethod: { name: method } } } }
        : {}),
      ...(alt
        ? { paymentOptions: { some: { paymentMethod: { isAlternative: true } } } }
        : {}),
    },
    include: {
      paymentOptions: { include: { paymentMethod: true } },
    },
    orderBy: { name: "asc" },
  });
  return { count: shops.length, shops };
});

app.get("/api/shops/:id", async (request, reply) => {
  const id = Number((request.params as { id: string }).id);
  if (!Number.isInteger(id)) return reply.status(400).send({ error: "Neplatné id" });
  const shop = await prisma.shop.findUnique({
    where: { id },
    include: {
      paymentOptions: { include: { paymentMethod: true, source: true } },
      sources: { include: { scrapeRuns: { orderBy: { startedAt: "desc" }, take: 5 } } },
    },
  });
  if (!shop) return reply.status(404).send({ error: "Obchod nenalezen" });
  return shop;
});

app.get("/api/payment-methods", async () => {
  const methods = await prisma.paymentMethod.findMany({
    orderBy: [{ isAlternative: "desc" }, { name: "asc" }],
  });
  return { count: methods.length, methods };
});

app.get("/api/scrapes", async () => {
  const runs = await prisma.scrapeRun.findMany({
    include: { source: { include: { shop: { select: { id: true, name: true } } } } },
    orderBy: { startedAt: "desc" },
    take: 50,
  });
  return { count: runs.length, runs };
});

const port = Number(process.env.PORT ?? 3000);

app
  .listen({ port, host: "0.0.0.0" })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
