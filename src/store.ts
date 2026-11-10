// Tiny JSON-file state: usage counters (grant KPIs), watchlists and alert subscriptions.
import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface AlertSub {
  minMcapUsd: number;
  maxLevel: "low" | "caution" | "high";
}

export interface State {
  users: string[];
  groups: string[];
  checks: number;
  watches: Record<string, string[]>; // chatId -> token addresses
  lastLevel: Record<string, string>; // token address -> last seen level (for watch alerts)
  alerts: Record<string, AlertSub>; // chatId -> filter
  alerted: string[]; // token addresses already announced
}

/** Storage key for a token address: EVM is case-insensitive, Solana base58 is not. */
export const addrKey = (address: string) => (address.startsWith("0x") ? address.toLowerCase() : address);

const empty = (): State => ({ users: [], groups: [], checks: 0, watches: {}, lastLevel: {}, alerts: {}, alerted: [] });

export class Store {
  state: State;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly file: string | null) {
    this.state = empty();
    if (file) {
      try {
        this.state = { ...empty(), ...JSON.parse(readFileSync(file, "utf8")) };
      } catch (e) {
        // First run: start empty. Unreadable file: keep a copy instead of silently overwriting the counters.
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
          console.error("state file unreadable, kept a copy:", (e as Error).message);
          copyFileSync(file, `${file}.bad-${Date.now()}`);
        }
      }
    }
  }

  touchChat(chatId: number, isGroup: boolean) {
    const list = isGroup ? this.state.groups : this.state.users;
    const id = String(chatId);
    if (list.includes(id)) return;
    list.push(id);
    this.save();
  }

  isWatched(address: string): boolean {
    const a = addrKey(address);
    return Object.values(this.state.watches).some((list) => list.includes(a));
  }

  countCheck() {
    this.state.checks++;
    this.save();
  }

  watch(chatId: number, address: string): boolean {
    const list = (this.state.watches[chatId] ??= []);
    const a = addrKey(address);
    if (list.includes(a) || list.length >= 20) return false;
    list.push(a);
    this.save();
    return true;
  }

  unwatch(chatId: number, address: string) {
    const list = this.state.watches[chatId] ?? [];
    this.state.watches[chatId] = list.filter((a) => a !== addrKey(address));
    this.save();
  }

  markAlerted(address: string) {
    this.state.alerted.push(address.toLowerCase());
    if (this.state.alerted.length > 5000) this.state.alerted.splice(0, 1000);
    this.save();
  }

  save() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => this.flush(), 500);
  }

  // Write now (used on shutdown so a redeploy does not drop the last changes)
  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    // Write a temp file, then swap it in: a crash mid-write must not leave a half file (which would load as empty).
    writeFileSync(this.file + ".tmp", JSON.stringify(this.state));
    renameSync(this.file + ".tmp", this.file);
  }
}
