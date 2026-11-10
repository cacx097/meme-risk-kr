// Tiny JSON-file state: usage counters (grant KPIs), watchlists and alert subscriptions.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

const empty = (): State => ({ users: [], groups: [], checks: 0, watches: {}, lastLevel: {}, alerts: {}, alerted: [] });

export class Store {
  state: State;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly file: string | null) {
    this.state = empty();
    if (file) {
      try {
        this.state = { ...empty(), ...JSON.parse(readFileSync(file, "utf8")) };
      } catch {
        // first run or unreadable file: start empty
      }
    }
  }

  touchChat(chatId: number, isGroup: boolean) {
    const list = isGroup ? this.state.groups : this.state.users;
    const id = String(chatId);
    if (!list.includes(id)) list.push(id);
    this.save();
  }

  countCheck() {
    this.state.checks++;
    this.save();
  }

  watch(chatId: number, address: string): boolean {
    const list = (this.state.watches[chatId] ??= []);
    const a = address.toLowerCase();
    if (list.includes(a) || list.length >= 20) return false;
    list.push(a);
    this.save();
    return true;
  }

  unwatch(chatId: number, address: string) {
    const list = this.state.watches[chatId] ?? [];
    this.state.watches[chatId] = list.filter((a) => a !== address.toLowerCase());
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
    writeFileSync(this.file, JSON.stringify(this.state));
  }
}
