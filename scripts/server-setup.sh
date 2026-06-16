#!/bin/bash
# Nexa — SSH-safe server setup
# Run via EC2 Instance Connect: bash server-setup.sh
set -euo pipefail

log() { echo "[$(date '+%H:%M:%S')] $*"; }
die() { echo "[ERROR] $*" >&2; exit 1; }

[[ "$(whoami)" == "ubuntu" ]] || die "Run as ubuntu, not root"

# ── 1. PIN SSH OPEN — first action, before anything else ─────────────────────
log "Pinning port 22 ACCEPT at iptables position 1..."
sudo iptables -I INPUT 1 -p tcp --dport 22 -j ACCEPT
sudo iptables -I OUTPUT 1 -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT
log "SSH port 22 locked open at kernel level"

# ── 2. Install base packages ──────────────────────────────────────────────────
log "Updating apt..."
sudo apt-get update -qq

log "Installing packages..."
sudo apt-get install -y -qq \
    apt-transport-https ca-certificates curl gnupg lsb-release \
    rsync git fail2ban iptables-persistent ufw

# ── 3. Docker ─────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    log "Installing Docker..."
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker ubuntu
    log "Docker installed"
else
    log "Docker already installed: $(docker --version)"
fi

log "Configuring Docker daemon..."
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json > /dev/null << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true
}
EOF
sudo systemctl enable docker
sudo systemctl restart docker
log "Docker daemon configured"

# ── 4. UFW — SSH first, ALWAYS ────────────────────────────────────────────────
log "Configuring UFW (SSH first)..."
sudo ufw --force reset

# Docker publishes ports via iptables DOCKER chain, bypassing UFW FORWARD.
# Setting DEFAULT_FORWARD_POLICY=ACCEPT ensures Docker container routing works.
sudo sed -i 's/DEFAULT_FORWARD_POLICY="DROP"/DEFAULT_FORWARD_POLICY="ACCEPT"/' /etc/default/ufw

sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw --force enable
log "UFW enabled — 22/80/443 open"
sudo ufw status numbered

# ── 5. Persist the hard SSH iptables rule across reboots ─────────────────────
log "Persisting iptables SSH rule..."
sudo iptables -I INPUT 1 -p tcp --dport 22 -j ACCEPT
sudo netfilter-persistent save
log "iptables rules saved to /etc/iptables/rules.v4"

# ── 6. fail2ban ───────────────────────────────────────────────────────────────
log "Configuring fail2ban..."
sudo tee /etc/fail2ban/jail.local > /dev/null << 'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port    = ssh
logpath = %(sshd_log)s
EOF
sudo systemctl enable fail2ban
sudo systemctl restart fail2ban
log "fail2ban active"

# ── 7. Project directory ──────────────────────────────────────────────────────
log "Creating /home/ubuntu/nexa..."
mkdir -p /home/ubuntu/nexa
sudo chown -R ubuntu:ubuntu /home/ubuntu/nexa

# ── 8. Final verification ─────────────────────────────────────────────────────
log "=== FINAL CHECK ==="
log "UFW SSH rule:      $(sudo ufw status | grep '22/tcp' || echo 'NOT FOUND')"
log "iptables SSH rule: $(sudo iptables -L INPUT --line-numbers | grep 22 | head -1)"
log "sshd running:      $(sudo systemctl is-active ssh)"
log "fail2ban running:  $(sudo systemctl is-active fail2ban)"
log "Docker running:    $(sudo systemctl is-active docker)"
log ""
log "=== Setup complete. Server is ready for rsync deploy. ==="
