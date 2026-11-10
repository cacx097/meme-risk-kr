// Usage: npm run check -- <token address (0x... Elysium or Solana mint)>
import { analyze, findAddress } from "./analyze.js";
import { textReport } from "./format.js";

const address = findAddress(process.argv[2] ?? "");
if (!address) {
  console.error("사용법: npm run check -- 토큰주소 (Elysium 0x... 또는 Solana)");
  process.exit(1);
}
console.log(textReport(await analyze(address)));
