const amqp = require("amqplib");

let channel;

async function connectRabbit() {
  if (channel) return channel;
  const conn = await amqp.connect(process.env.RABBITMQ_URL);
  channel = await conn.createChannel();
  await channel.assertQueue("leads.enrich", { durable: true });
  await channel.assertQueue("leads.webhook", { durable: true });
  return channel;
}

async function publishLead(leadId) {
  const ch = await connectRabbit();
  const msg = JSON.stringify({ lead_id: leadId });
  ch.sendToQueue("leads.enrich", Buffer.from(msg), { persistent: true });
  console.log(`Published lead ${leadId} to queue`);
}

module.exports = { connectRabbit, publishLead };
