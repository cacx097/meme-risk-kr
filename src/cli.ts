// Usage: npm run check -- <token address>
import { analyze, EVM_ADDRESS } from "./analyze.js";
import { textReport } from "./format.js";

const address = process.argv[2];
if (!address || !EVM_ADDRESS.test(address)) {
  console.error("사용법: npm run check -- 0x토큰주소");
  process.exit(1);
}
console.log(textReport(await analyze(address)));
