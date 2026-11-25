import * as Blockly from "blockly";

import { extractBlockLineRanges, setBlockMarkers, stripBlockMarkers, type BlockLineRanges } from "@/lib/blockly/codeLineMap";
import { getGenerator } from "@/lib/blockly/generator";
import { generateArduinoTemplate, generateMicroPythonTemplate } from "@/templates/codeTemplates";

interface BlocklyGeneratorLike {
  init: (workspace: Blockly.Workspace) => void;
  blockToCode?: (block: Blockly.Block) => unknown;
  setups_?: Record<string, string | undefined>;
  getImports?: () => string[];
}

export interface BlocklyCodegenResult {
  code: string;
  hasRootBlock: boolean;
  looseTopLevelBlockCount: number;
  /** Lines of `code` each statement block produced, keyed by block id (see codeLineMap.ts). */
  blockLineRanges: BlockLineRanges;
}

function prefersSetupSection(blockType: string) {
  return blockType === "arduino_pinMode" || blockType === "arduino_serialBegin" || blockType.endsWith("_init");
}

function extractStatementCode(generated: unknown) {
  return typeof generated === "string" ? generated : "";
}

function getLooseTopLevelBlocks(workspace: Blockly.Workspace, rootBlockIds: Set<string>) {
  return workspace
    .getTopBlocks(false)
    .filter((block) => !block.isShadow())
    .filter((block) => !rootBlockIds.has(block.id))
    .filter((block) => Boolean(block.previousConnection || block.nextConnection));
}

export function buildSourceCodeFromBlocklyWorkspace(
  workspace: Blockly.Workspace,
  generatorType: string
): BlocklyCodegenResult {
  const generator = getGenerator(generatorType) as unknown as BlocklyGeneratorLike;
  // Markers are switched on only for this build and always switched off again, so any other
  // blockToCode() call (tests, other tools) gets plain code.
  setBlockMarkers(generator, true);
  try {
    const { code: markedCode, ...rest } = buildMarkedSource(workspace, generatorType, generator);
    const { code, ranges } = extractBlockLineRanges(markedCode);
    return { ...rest, code, blockLineRanges: ranges };
  } finally {
    setBlockMarkers(generator, false);
  }
}

function buildMarkedSource(
  workspace: Blockly.Workspace,
  generatorType: string,
  generator: BlocklyGeneratorLike
): Omit<BlocklyCodegenResult, "blockLineRanges"> {
  generator.init(workspace);

  const rootBlocks = workspace.getBlocksByType("arduino_setup_loop");
  const rootBlock = rootBlocks.length > 0 ? rootBlocks[0] : null;
  const rootGenerated = rootBlock ? extractStatementCode(generator.blockToCode?.(rootBlock)) : "";

  // New standalone root blocks (Code Kit style)
  const onStartBlocks = workspace.getBlocksByType("arduino_on_start");
  const foreverBlocks = workspace.getBlocksByType("arduino_forever");
  for (const b of [...onStartBlocks, ...foreverBlocks]) {
    generator.blockToCode?.(b);
  }

  // Treat all three root block types as "root" so they are excluded from loose block logic
  const rootBlockIds = new Set<string>([
    ...(rootBlock ? [rootBlock.id] : []),
    ...onStartBlocks.map((b) => b.id),
    ...foreverBlocks.map((b) => b.id),
  ]);
  const hasAnyRootBlock = rootBlock !== null || onStartBlocks.length > 0 || foreverBlocks.length > 0;


  const looseTopLevelBlocks = getLooseTopLevelBlocks(workspace, rootBlockIds);
  const looseSetupEntries: string[] = [];
  const looseLoopEntries: string[] = [];

  for (const block of looseTopLevelBlocks) {
    const generated = extractStatementCode(generator.blockToCode?.(block));
    if (!generated.trim()) {
      continue;
    }

    if (prefersSetupSection(block.type)) {
      looseSetupEntries.push(generated);
    } else {
      looseLoopEntries.push(generated);
    }
  }

  const setupsDict = generator.setups_ || {};
  const loopEntries: string[] = [];
  const manualSetupCode = setupsDict["__setup_code__"] || setupsDict["manual_setup"] || "";
  // Lines parts register for setup (Serial.begin, pinMode, pin objects, sensor begin calls).
  // They run before the user's own setup blocks, so e.g. a print in setup comes after
  // Serial.begin() and a pin is configured before the first write.
  const partSetupEntries: string[] = [];

  if (manualSetupCode.trim()) {
    looseSetupEntries.unshift(manualSetupCode);
  }

  const rootLoopCode = setupsDict["__loop_code__"] || setupsDict["manual_loop"] || rootGenerated || "";
  if (rootLoopCode.trim()) {
    loopEntries.push(rootLoopCode);
  }
  loopEntries.push(...looseLoopEntries);

  const globalEntries: string[] = [];

  for (const name in setupsDict) {
    // These are consumed above and must not be double-emitted
    if (name === "__loop_code__" || name === "__setup_code__" || name === "manual_setup" || name === "manual_loop") continue;

    const snippet = setupsDict[name];
    if (typeof snippet !== "string" || snippet.trim().length === 0) continue;

    if (generatorType === "arduino") {
      // Classify by the snippet's text, not the block line markers that may wrap it.
      const trimmed = stripBlockMarkers(snippet).trimStart();
      const isGlobalSnippet =
        name.startsWith("include_") ||
        name.startsWith("declare_") ||
        name.startsWith("helper_") ||
        trimmed.startsWith("#include") ||
        trimmed.startsWith("Servo ") ||
        trimmed.startsWith("DHT ") ||
        trimmed.startsWith("Encoder ") ||
        trimmed.startsWith("const int ") ||
        trimmed.startsWith("Adafruit_") ||
        trimmed.startsWith("long readUltrasonicDistance") ||
        /^[A-Za-z_][\w:<>&*\s]*\([^)]*\)\s*\{/.test(trimmed);

      if (isGlobalSnippet) {
        globalEntries.push(snippet);
      } else {
        partSetupEntries.push(snippet);
      }
    } else {
      partSetupEntries.push(snippet);
    }
  }

  const setupCode = [...partSetupEntries, ...looseSetupEntries].join("\n");
  const loopCode = loopEntries.join("\n");

  if (generatorType === "micropython") {
    const indentedLoop = loopCode
      .split("\n")
      .map((line) => (line ? `    ${line}` : line))
      .join("\n");
    const importLines = typeof generator.getImports === "function" ? generator.getImports() : [];

    return {
      code: generateMicroPythonTemplate(importLines, setupCode, indentedLoop),
      hasRootBlock: hasAnyRootBlock,
      looseTopLevelBlockCount: looseTopLevelBlocks.length,
    };
  }

  return {
    code: generateArduinoTemplate(globalEntries.join("\n"), setupCode, loopCode),
    hasRootBlock: hasAnyRootBlock,
    looseTopLevelBlockCount: looseTopLevelBlocks.length,
  };
}


