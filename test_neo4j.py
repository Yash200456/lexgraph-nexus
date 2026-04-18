from dotenv import load_dotenv
import os
from neo4j import GraphDatabase
import socket

# Force IPv4
original_getaddrinfo = socket.getaddrinfo
def getaddrinfo_ipv4(host, port, family=0, type=0, proto=0, flags=0):
    return original_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)
socket.getaddrinfo = getaddrinfo_ipv4

load_dotenv(override=True)

def _get_env_value(*names: str) -> str:
    """Return first non-empty env var, trimmed and de-quoted."""
    for name in names:
        raw = os.getenv(name)
        if raw is None:
            continue
        value = raw.strip()
        if not value:
            continue
        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1].strip()
        if value:
            return value
    return ""


uri = _get_env_value('NEO4J_URI')
user = _get_env_value('NEO4J_USER', 'NEO4J_USERNAME')
pwd = _get_env_value('NEO4J_PASSWORD')
trust_all_certs = _get_env_value('NEO4J_TRUST_ALL_CERTS').lower() in {
    '1',
    'true',
    'yes',
    'on',
}

if trust_all_certs and uri:
    if uri.startswith('neo4j+s://'):
        uri = uri.replace('neo4j+s://', 'neo4j+ssc://', 1)
    elif uri.startswith('bolt+s://'):
        uri = uri.replace('bolt+s://', 'bolt+ssc://', 1)

print(f"URI: {uri}")
print(f"USER: {user}")

try:
    driver = GraphDatabase.driver(uri, auth=(user, pwd))
    driver.verify_connectivity()
    with driver.session() as s:
        r = s.run("RETURN 1 AS ok").single()
        print("✅ Connected! Neo4j is working.")
    driver.close()
except Exception as e:
    print(f"❌ Failed: {e}")