import pika
import time
import psycopg2
import redis
import os
import json
import sys

# Unbuffered stdout for Docker logs
sys.stdout.reconfigure(line_buffering=True)

# Environment variables
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")
DATABASE_URL = os.getenv("DATABASE_URL", "postgres://user:password@db:5432/leadsdb")
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

# Redis client (for cache invalidation)
r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)


def connect_rabbitmq():
    """Retry loop until RabbitMQ becomes available"""
    for i in range(20):
        try:
            print(f"🔁 Trying to connect to RabbitMQ ({i+1}/20)...", flush=True)
            params = pika.URLParameters(RABBITMQ_URL)
            connection = pika.BlockingConnection(params)
            print("✅ Connected to RabbitMQ", flush=True)
            return connection
        except pika.exceptions.AMQPConnectionError as e:
            print("❌ RabbitMQ not ready yet:", e, flush=True)
            time.sleep(3)
    raise Exception("❌ Could not connect to RabbitMQ after 20 tries")


def connect_postgres():
    """Retry loop until PostgreSQL becomes available"""
    for i in range(10):
        try:
            print(f"🔁 Trying to connect to PostgreSQL ({i+1}/10)...", flush=True)
            conn = psycopg2.connect(DATABASE_URL)
            print("✅ Connected to PostgreSQL", flush=True)
            return conn
        except Exception as e:
            print("❌ Database connection failed:", e, flush=True)
            time.sleep(3)
    raise Exception("❌ Could not connect to PostgreSQL")


def callback(ch, method, properties, body):
    """Callback when a message is received from the queue"""
    data = json.loads(body)
    print("📩 Received message:", data, flush=True)

    lead_id = data.get("lead_id")
    if not lead_id:
        print("⚠️ No lead_id found in message, skipping.", flush=True)
        return

    conn = connect_postgres()
    cur = conn.cursor()

    try:
        # "Enrichment" step: add company and mark as processed
        cur.execute(
            "UPDATE leads SET company = %s, status = %s WHERE id = %s",
            ("Unknown", "processed", lead_id),
        )

        # Log the event in lead_events table
        cur.execute(
            "INSERT INTO lead_events (lead_id, event_type) VALUES (%s, %s)",
            (lead_id, "lead_processed"),
        )

        conn.commit()
        print(f"✅ Lead {lead_id} enriched and marked as processed.", flush=True)

        # Invalidate Redis cache
        cache_key = f"lead:{lead_id}"
        r.delete(cache_key)
        print(f"🧹 Cache invalidated for {cache_key}", flush=True)

    except Exception as e:
        print("❌ Error processing lead:", e, flush=True)
        conn.rollback()
    finally:
        cur.close()
        conn.close()


def callback_webhook(ch, method, properties, body):
    data = json.loads(body)
    lead_id = data.get("lead_id")
    status = data.get("status")
    print(f"📬 Webhook updated lead {lead_id} to {status}")
    ch.basic_ack(delivery_tag=method.delivery_tag)

# --- Main worker process ---
connection = connect_rabbitmq()
channel = connection.channel()
channel.queue_declare(queue="leads.enrich", durable=True)
print("🐍 Worker Python started. Waiting for messages...", flush=True)

channel.queue_declare(queue="leads.webhook", durable=True)
channel.basic_consume(queue="leads.webhook", on_message_callback=callback_webhook)

channel.basic_consume(queue="leads.enrich", on_message_callback=callback, auto_ack=True)
channel.start_consuming()
