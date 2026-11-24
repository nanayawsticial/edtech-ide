"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Link2, Radio, TerminalSquare, Zap } from "lucide-react";
import ConsolePanel from "./ConsolePanel";
import type { useWebSerial, SerialMessage } from "../../hooks/useWebSerial";
import { useSimulationStore } from "@/stores/simulationStore";

export type BlockTerminalTab = "serial" | "build" | "connection";

interface BlockTerminalShellProps {
  webSerial: ReturnType<typeof useWebSerial>;
  collapsed: boolean;
  requestedTab?: BlockTerminalTab;
  onToggleCollapsed: () => void;
  onTabChange?: (tab: BlockTerminalTab) => void;
}

const TAB_OPTIONS: Array<{ id: BlockTerminalTab; label: string; icon: React.ReactNode }> = [
  { id: "serial", label: "Serial Monitor", icon: <TerminalSquare size={14} /> },
  { id: "build", label: "Build Output", icon: <Zap size={14} /> },
  { id: "connection", label: "Connection", icon: <Link2 size={14} /> },
];

const BUILD_MESSAGE_PATTERN = /(compil|upload|flash|stk500|hex|syncing|synced |raw repl|main\.py|micropython sync|compiler api|files saved to the micropython device|connect device first|upload aborted|verify|simulation did not start)/i;
// Compiler diagnostics such as "main.cpp:2:11: error: 'D12' was not declared in this scope".
const COMPILER_DIAGNOSTIC_PATTERN = /^\s*\S+:\d+:(?:\d+:)?\s*(?:fatal error|error|warning|note):/i;
const CONNECTION_MESSAGE_PATTERN = /(connected to device|disconnected|disconnect|connection failed|no port selected|web serial|device disconnected unexpectedly|usb|baud|browser)/i;

function getMessageChannel(message: SerialMessage): BlockTerminalTab {
  if (BUILD_MESSAGE_PATTERN.test(message.text) || COMPILER_DIAGNOSTIC_PATTERN.test(message.text)) {
    return "build";
  }

  if (CONNECTION_MESSAGE_PATTERN.test(message.text)) {
    return "connection";
  }

  return "serial";
}

function toneForMessage(type: SerialMessage["type"]) {
  switch (type) {
    case "system":
      return "border border-sky-400/18 bg-sky-400/10 text-sky-100";
    case "error":
      return "border border-rose-400/20 bg-rose-400/10 text-rose-100";
    case "sent":
      return "border border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
    default:
      return "ui-elevated-surface text-[var(--ui-color-text-on-surface)]";
  }
}

export default function BlockTerminalShell({
  webSerial,
  collapsed,
  requestedTab,
  onToggleCollapsed,
  onTabChange,
}: BlockTerminalShellProps) {
  const [activeTab, setActiveTab] = useState<BlockTerminalTab>(requestedTab ?? "serial");

  useEffect(() => {
    if (!requestedTab) return;
    setActiveTab(requestedTab);
  }, [requestedTab]);

  const serialMessages = useMemo(
    () => webSerial.messages.filter((message) => getMessageChannel(message) === "serial"),
    [webSerial.messages]
  );

  const buildMessages = useMemo(
    () => webSerial.messages.filter((message) => getMessageChannel(message) === "build").slice(-60),
    [webSerial.messages]
  );

  const connectionMessages = useMemo(
    () => webSerial.messages.filter((message) => getMessageChannel(message) === "connection").slice(-16),
    [webSerial.messages]
  );

  const simulatedLineCount = useSimulationStore((state) => state.simulatedSerialLines.length);
  const isSimulating = useSimulationStore((state) => state.simulationState.running);
  const isSerialSupported = typeof navigator !== "undefined" && "serial" in navigator;

  const channelCounts: Record<BlockTerminalTab, number> = {
    serial: serialMessages.length + simulatedLineCount,
    build: buildMessages.length,
    connection: connectionMessages.length,
  };

  // Messages that arrived while the dock was folded count as "new" until it is opened again.
  const [seenCounts, setSeenCounts] = useState<Record<BlockTerminalTab, number>>(channelCounts);
  useEffect(() => {
    if (collapsed) return;
    setSeenCounts((previous) =>
      previous.serial === channelCounts.serial && previous.build === channelCounts.build && previous.connection === channelCounts.connection
        ? previous
        : { ...channelCounts }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, channelCounts.serial, channelCounts.build, channelCounts.connection]);

  const latestMessage = webSerial.messages.length > 0 ? webSerial.messages[webSerial.messages.length - 1] : null;

  const handleTabChange = (tab: BlockTerminalTab) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  const openOnTab = (tab: BlockTerminalTab) => {
    handleTabChange(tab);
    onToggleCollapsed();
  };

  if (collapsed) {
    return (
      <section
        aria-label="Terminal status"
        className="ui-foundation-panel flex h-11 items-center gap-3 rounded-[18px] px-3 shadow-[0_20px_40px_-32px_rgba(0,0,0,0.42)]"
      >
        <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-[var(--ui-color-text-soft)]">
          <span
            className={`h-2 w-2 rounded-full ${webSerial.isConnected ? "bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.2)]" : "border border-[color:var(--ui-color-text-soft)]"}`}
            aria-hidden="true"
          />
          {webSerial.isConnected ? "Connected" : "Not connected"}
        </span>
        <span className="h-5 w-px shrink-0 bg-[color:var(--ui-border-soft)]" aria-hidden="true" />
        <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Open the terminal on">
          {TAB_OPTIONS.map((tab) => {
            const unread = Math.max(0, channelCounts[tab.id] - seenCounts[tab.id]);
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => openOnTab(tab.id)}
                className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-[var(--ui-color-text-soft)] transition-colors hover:bg-[color:var(--ui-surface-elevated)] hover:text-[var(--ui-color-text-on-surface)]"
              >
                {tab.icon}
                {tab.id === "serial" ? "Serial" : tab.id === "build" ? "Build" : "Connection"}
                {unread > 0 ? (
                  <span className="rounded-full bg-[color:var(--ui-color-primary)] px-1.5 py-0.5 text-[10px] font-bold text-white">{unread} new</span>
                ) : null}
              </button>
            );
          })}
        </div>
        <p
          className={`min-w-0 flex-1 truncate text-xs ${latestMessage?.type === "error" ? "font-semibold ui-text-error" : "text-[var(--ui-color-text-soft)]"}`}
          title={latestMessage?.text}
        >
          {latestMessage ? latestMessage.text : "No messages yet. Verify, upload or connect a board to see output here."}
        </p>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Open terminal"
          title="Open terminal"
          className="ui-action-quiet inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] transition-all"
        >
          <ChevronUp size={15} />
        </button>
      </section>
    );
  }

  return (
    <section className="ui-foundation-panel flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] shadow-[0_28px_70px_-42px_rgba(0,0,0,0.42)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--ui-border-soft)] px-3 py-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5" role="group" aria-label="Terminal views">
          {TAB_OPTIONS.map((tab) => {
            const isActive = activeTab === tab.id;
            const count = channelCounts[tab.id];
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => handleTabChange(tab.id)}
                className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-all ${
                  isActive
                    ? 'ui-tab-active shadow-[0_14px_26px_-18px_rgba(0,0,0,0.28)]'
                    : 'ui-pill-surface text-[var(--ui-color-text-soft)] hover:bg-[color:var(--ui-surface-elevated)] hover:text-[var(--ui-color-text-on-surface)]'
                }`}
              >
                {tab.icon}
                {tab.label}
                <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-bold opacity-90">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] ${
              webSerial.isConnected || isSimulating
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                : "ui-pill-surface text-[var(--ui-color-text-soft)]"
            }`}
          >
            <Radio size={12} />
            {webSerial.isConnected ? "Connected" : isSimulating ? "Simulating" : "Disconnected"}
          </span>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Collapse terminal"
            title="Collapse terminal"
            className="ui-action-quiet inline-flex h-8 w-8 items-center justify-center rounded-[10px] transition-all"
          >
            <ChevronDown size={15} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === "serial" ? (
          <ConsolePanel
            webSerial={webSerial}
            messages={serialMessages}
            emptyTitle="No serial activity yet"
            emptyBody="Run the simulation or connect a board. Whatever your program prints with Serial shows up here."
          />
        ) : null}

        {activeTab === "build" ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {buildMessages.length > 0 ? (
                buildMessages.map((message, index) => (
                  <div key={`${message.timestamp}-${index}`} className={`rounded-[12px] px-3 py-2 ${toneForMessage(message.type)}`}>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">{message.type}</div>
                    <div className="whitespace-pre-wrap break-words text-xs leading-5">{message.text}</div>
                  </div>
                ))
              ) : (
                <div className="flex h-full min-h-[72px] items-center justify-center text-center">
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--ui-color-text-soft)]">No build activity yet</p>
                    <p className="text-xs ui-panel-copy-quiet">Run Verify or Upload. Compile, upload and sync events show up here.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {activeTab === "connection" ? (
          <div className="custom-scrollbar h-full overflow-y-auto p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="ui-elevated-surface rounded-[18px] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--ui-color-text-soft)]">Status</p>
                <p className="mt-3 text-lg font-semibold text-[var(--ui-color-text-on-surface)]">
                  {webSerial.isConnected ? "Board connected" : "Waiting for a board"}
                </p>
                <p className="mt-2 text-sm leading-6 ui-panel-copy-quiet">
                  {webSerial.isConnected
                    ? "Serial communication is available. You can monitor output here while you build with blocks."
                    : "Use Connect in the top bar or open the Serial Monitor tab to choose a baud rate and attach a device."}
                </p>
              </div>
              <div className="ui-elevated-surface rounded-[18px] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--ui-color-text-soft)]">Browser support</p>
                <p className="mt-3 text-lg font-semibold text-[var(--ui-color-text-on-surface)]">
                  {isSerialSupported ? "Web Serial ready" : "Web Serial unavailable"}
                </p>
                <p className="mt-2 text-sm leading-6 ui-panel-copy-quiet">
                  {isSerialSupported
                    ? "This browser can open serial devices for the block environment."
                    : "Serial features need a browser with Web Serial support, such as Chrome or Edge."}
                </p>
              </div>
            </div>

            <div className="ui-quiet-surface mt-4 rounded-[18px] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--ui-color-text-soft)]">Recent connection events</p>
              <div className="mt-3 space-y-2">
                {connectionMessages.length > 0 ? (
                  connectionMessages.map((message, index) => (
                    <div key={`${message.timestamp}-${index}`} className={`rounded-[12px] px-3 py-2 ${toneForMessage(message.type)}`}>
                      <div className="whitespace-pre-wrap break-words text-xs leading-5">{message.text}</div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm ui-panel-copy-quiet">No connection events yet.</p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
