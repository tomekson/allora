import Fastify from "fastify";
import { prisma } from "./lib/prisma.js";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok" }));

app.get("/api/shops", async () => {
  const shops = await prisma.shop.findMany({
    where: { active: true },
    include: {
      paymentOptions: {
        include: { paymentMethod: true },
      },
    },
    orderBy: { name: "asc" },
  });
  return { count: shops.length, shops };
});

app.get("/api/payment-methods", async () => {
  const methods = await prisma.paymentMethod.findMany({
    orderBy: [{ isAlternative: "desc" }, { name: "asc" }],
  });
  return { count: methods.length, methods };
});

const port = Number(process.env.PORT ?? 3000);

app
  .listen({ port, host: "0.0.0.0" })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
