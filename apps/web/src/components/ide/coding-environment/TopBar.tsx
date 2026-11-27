"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Blocks, CheckCircle2, ChevronRight, Code2, Download, MoreHorizontal, Play, Plus, Rocket, RotateCcw, Save, Settings2, Square } from 'lucide-react';
import type { CodingMode } from '@/contexts/BoardContext';
import { Button } from '@/components/ui/Button';
import { MenuButton } from '@/components/ui/MenuButton';
import { fadeInUp } from '@/components/ui/motion';
import ThemeToggle from '@/components/layout/ThemeToggle';
import BackHomeButtons from '@/components/layout/BackHomeButtons';

interface CodingEnvironmentTopBarProps {
  projectName: string;
  boardName: string;
  codingMode: CodingMode;
  isSimulationActive: boolean;
  isSimulationBusy: boolean;
  supportsSimulation: boolean;
  canUploadAndSimulate: boolean;
  canResetSimulation: boolean;
  componentCount: number;
  mappedPinCount: number;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  isCompiling?: boolean;
  onBackToCircuitLab: () => void;
  onChangeCodingMode: (mode: Exclude<CodingMode, null>) => void;
  onUploadAndSimulate: () => void;
  onStopSimulation: () => void;
  onResetSimulation: () => void;
  onSaveProject: () => void;
  onNewSketch: () => void;
  onOpenPreferences: () => void;
  /** Saves the project as a .sticial file. */
  onExportProject?: () => void;
  onVerify?: () => void;
  onUpload?: () => void;
  saveStatusText?: string | null;
  saveStatusTone?: 'neutral' | 'success' | 'error';
}

export default function CodingEnvironmentTopBar({
  projectName,
  boardName,
  codingMode,
  isSimulationActive,
  isSimulationBusy,
  supportsSimulation,
  canUploadAndSimulate,
  canResetSimulation,
  componentCount,
  mappedPinCount,
  hasUnsavedChanges,
  isSaving,
  isCompiling = false,
  onBackToCircuitLab,
  onChangeCodingMode,
  onUploadAndSimulate,
  onStopSimulation,
  onResetSimulation,
  onSaveProject,
  onNewSketch,
  onOpenPreferences,
  onExportProject,
  onVerify,
  onUpload,
  saveStatusText,
  saveStatusTone = 'neutral',
}: CodingEnvironmentTopBarProps) {
  const activeMode = codingMode === 'text' ? 'text' : 'block';
  const simulationDisabled = !supportsSimulation || isSimulationBusy || (!isSimulationActive && !canUploadAndSimulate);
  const saveStatusClass =
    saveStatusTone === 'success'
      ? 'border-emerald-400/20 bg-emerald-400/12 text-emerald-200'
      : saveStatusTone === 'error'
        ? 'border-rose-400/24 bg-rose-400/12 text-rose-100'
        : 'border-white/10 bg-white/[0.04] text-slate-300';

  if (activeMode === 'block') {
    return (
      <motion.header
        className='overflow-hidden rounded-[18px] border border-white/8 bg-[linear-gradient(180deg,var(--ide-header-from)_0%,var(--ide-header-to)_100%)] shadow-[0_24px_64px_-44px_rgba(0,0,0,1)] sm:rounded-[24px]'
        variants={fadeInUp}
        initial='hidden'
        animate='visible'
      >
        <div className='flex flex-wrap items-center gap-3 px-3 py-2.5 sm:px-4'>
          <div className='flex min-w-0 flex-wrap items-center gap-2'>
              <div className='inline-flex items-center gap-1 rounded-[16px] border border-white/10 bg-white/[0.04] p-1.5'>
                <button
                  type='button'
                  onClick={() => onChangeCodingMode('block')}
                  className='inline-flex items-center gap-2 rounded-[12px] bg-[linear-gradient(180deg,var(--ide-accent-from)_0%,var(--ide-accent-to)_100%)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white shadow-[0_16px_32px_-22px_var(--ide-accent-glow)] transition-all'
                >
                  <Blocks size={14} />
                  Blocks
                </button>
                <button
                  type='button'
                  onClick={() => onChangeCodingMode('text')}
                  className='inline-flex items-center gap-2 rounded-[12px] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300 transition-all hover:bg-white/[0.06] hover:text-white'
                >
                  <Code2 size={14} />
                  Text
                </button>
              </div>
              <span className='rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300'>
                {boardName}
              </span>
              {saveStatusText ? <span className={`rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] ${saveStatusClass}`}>{saveStatusText}</span> : null}
          </div>

          <nav aria-label='Project steps' className='mx-auto flex items-center gap-1 rounded-[16px] border border-white/10 bg-white/[0.04] p-1.5'>
            <button
              type='button'
              onClick={onBackToCircuitLab}
              title='Go to Circuit Lab to build your circuit'
              className={`inline-flex h-9 items-center gap-2 rounded-[12px] px-3 text-xs font-semibold uppercase tracking-[0.16em] transition-all hover:bg-white/[0.06] ${componentCount > 0 ? 'text-emerald-100' : 'text-slate-300'}`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${componentCount > 0 ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/[0.08] text-slate-300'}`}>
                {componentCount > 0 ? <CheckCircle2 size={13} aria-hidden='true' /> : '1'}
              </span>
              Build
            </button>
            <ChevronRight size={14} className='text-slate-500' aria-hidden='true' />
            <span
              aria-current='step'
              className='inline-flex h-9 items-center gap-2 rounded-[12px] border border-violet-300/24 bg-violet-400/14 px-3 text-xs font-semibold uppercase tracking-[0.16em] text-violet-100'
            >
              <span className='flex h-5 w-5 items-center justify-center rounded-full bg-violet-300/25 text-[10px]'>2</span>
              Code
            </span>
            <ChevronRight size={14} className='text-slate-500' aria-hidden='true' />
            <button
              type='button'
              onClick={onUploadAndSimulate}
              disabled={simulationDisabled || isSimulationActive}
              title={canUploadAndSimulate ? 'Run your code in the simulator' : 'Add blocks and a circuit first'}
              className={`inline-flex h-9 items-center gap-2 rounded-[12px] px-3 text-xs font-semibold uppercase tracking-[0.16em] transition-all enabled:hover:bg-white/[0.06] disabled:cursor-default ${canUploadAndSimulate || isSimulationActive ? 'text-cyan-100' : 'text-slate-400'}`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${canUploadAndSimulate || isSimulationActive ? 'bg-cyan-400/20 text-cyan-100' : 'bg-white/[0.08] text-slate-400'}`}>3</span>
              Run
            </button>
          </nav>

          <div className='flex w-full items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0 md:w-auto md:pb-0'>
            <BackHomeButtons
              backFallbackHref="/dashboard"
              variant="inverse"
              size="sm"
              buttonClassName="min-h-11 rounded-[16px] border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white hover:border-white/16 hover:bg-white/[0.08] hover:text-white"
            />
            <Button
              variant='secondary'
              icon={<Save size={16} />}
              onClick={onSaveProject}
              disabled={isSaving}
              className='min-h-11 rounded-[16px] border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white hover:border-white/16 hover:bg-white/[0.08] hover:text-white'
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
            <MenuButton
              label='More'
              icon={<MoreHorizontal size={16} aria-hidden='true' />}
              className='inline-flex min-h-11 items-center gap-2 rounded-[16px] border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-white/16 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/50'
              items={[
                { id: 'new-sketch', label: 'New Sketch', icon: <Plus size={15} />, onSelect: onNewSketch },
                ...(onExportProject ? [{ id: 'export', label: 'Export project file', icon: <Download size={15} />, onSelect: onExportProject }] : []),
                { id: 'reset', label: 'Reset simulation', icon: <RotateCcw size={15} />, onSelect: onResetSimulation, disabled: !canResetSimulation },
                { id: 'preferences', label: 'Preferences', icon: <Settings2 size={15} />, onSelect: onOpenPreferences },
              ]}
            />
            <Button
              icon={isSimulationActive ? <Square size={16} /> : <Play size={16} />}
              onClick={() => {
                if (isSimulationActive) {
                  onStopSimulation();
                } else {
                  onUploadAndSimulate();
                }
              }}
              disabled={simulationDisabled}
              className={`min-h-11 rounded-[16px] px-4 py-2 text-sm text-white ${
                isSimulationActive
                  ? 'border border-rose-300/24 bg-[linear-gradient(180deg,#e2567b_0%,#cc466c_100%)] hover:bg-[linear-gradient(180deg,#eb5e83_0%,#d54d73_100%)]'
                  : 'border border-indigo-300/24 bg-[linear-gradient(180deg,var(--ide-accent-from)_0%,var(--ide-accent-to)_100%)] hover:bg-[linear-gradient(180deg,var(--ide-accent-hover-from)_0%,var(--ide-accent-hover-to)_100%)]'
              }`}
            >
              {isSimulationBusy && !isSimulationActive
                ? 'Preparing...'
                : isSimulationActive
                  ? 'Stop Simulation'
                  : 'Run Simulation'}
            </Button>
          </div>
        </div>
      </motion.header>
    );
  }

  return (
    <motion.header
      className='flex-shrink-0 overflow-hidden rounded-[18px] border border-white/8 bg-[linear-gradient(180deg,var(--ide-header-from)_0%,var(--ide-header-to)_100%)] shadow-[0_24px_64px_-44px_rgba(0,0,0,1)] sm:rounded-[24px]'
      variants={fadeInUp}
      initial='hidden'
      animate='visible'
    >
      <div className='flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-5'>
        {/* ── Left: mode switcher + board chip + status ──────────── */}
        <div className='flex min-w-0 flex-wrap items-center gap-2'>

          {/* Verify button */}
          {onVerify ? (
            <button
              type='button'
              onClick={onVerify}
              disabled={isCompiling}
              title='Verify sketch'
              className='flex h-9 items-center gap-2 rounded-[8px] border px-3.5 text-xs font-semibold transition-all disabled:opacity-50'
              style={{ background: '#1c3030', borderColor: '#2a5555', color: '#52b8c8' }}
            >
              <CheckCircle2 size={14} strokeWidth={2.2} className={isCompiling ? 'animate-pulse' : ''} />
              <span>{isCompiling ? 'Verifying…' : 'Verify'}</span>
            </button>
          ) : null}

          {/* Upload button */}
          {onUpload ? (
            <button
              type='button'
              onClick={onUpload}
              disabled={isCompiling}
              title='Upload to board'
              className='flex h-9 items-center gap-2 rounded-[8px] border border-indigo-400/40 bg-indigo-500/15 px-3.5 text-xs font-semibold text-indigo-200 transition-all disabled:opacity-50'
            >
              <Rocket size={14} strokeWidth={2.2} />
              <span>{isCompiling ? 'Uploading…' : 'Upload'}</span>
            </button>
          ) : null}

          {/* Divider */}
          {(onVerify || onUpload) ? (
            <div className='h-5 w-px bg-white/10' />
          ) : null}

          {/* Block / Text mode switcher */}
          <div className='inline-flex items-center gap-1 rounded-[10px] border border-white/10 bg-[color:var(--ide-segment-bg)]/80 p-0.5 shadow-inner backdrop-blur-md'>
            <button
              type='button'
              onClick={() => onChangeCodingMode('block')}
              className='relative flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 transition-all hover:bg-white/[0.04] hover:text-white'
            >
              <Blocks size={11} className='text-indigo-400' />
              Blocks
            </button>
            <button
              type='button'
              onClick={() => onChangeCodingMode('text')}
              className='relative flex items-center gap-1.5 rounded-[8px] bg-cyan-500 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white shadow-md shadow-cyan-500/20 transition-all'
            >
              <Code2 size={11} className='text-white' />
              Text
            </button>
          </div>

          <span className='inline-flex items-center gap-2 text-[12px] font-medium text-sky-200/90'>
            {boardName}
          </span>

          {hasUnsavedChanges ? (
            <span className='inline-flex items-center gap-1.5 rounded-full border border-amber-300/24 bg-amber-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100'>
              <span className='h-1.5 w-1.5 rounded-full bg-amber-300' />
              Unsaved
            </span>
          ) : null}

          {saveStatusText ? (
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${saveStatusClass}`}>
              {saveStatusText}
            </span>
          ) : null}
        </div>

        {/* ── Right: action buttons ──────────────────────────────── */}
        <div className='flex w-full items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0 md:w-auto md:pb-0'>
          <BackHomeButtons
            backFallbackHref="/dashboard"
            variant="inverse"
            size="sm"
            buttonClassName="min-h-9 rounded-[12px] border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white hover:border-white/16 hover:bg-white/[0.08] hover:text-white"
          />
          <Button
            variant='secondary'
            icon={<ArrowLeft size={14} />}
            onClick={onBackToCircuitLab}
            className='min-h-9 rounded-[12px] border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white hover:border-white/16 hover:bg-white/[0.08] hover:text-white'
          >
            Circuit
          </Button>
          <Button
            variant='secondary'
            icon={<Save size={14} />}
            onClick={onSaveProject}
            disabled={isSaving}
            className='min-h-9 rounded-[12px] border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white hover:border-white/16 hover:bg-white/[0.08] hover:text-white'
          >
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
          <Button
            variant='secondary'
            icon={<Plus size={14} />} 
            onClick={onNewSketch}
            className='min-h-9 rounded-[12px] border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white hover:border-white/16 hover:bg-white/[0.08] hover:text-white'
          >
            New Sketch
          </Button>
          <Button
            icon={isSimulationActive ? <Square size={14} /> : <Play size={14} />}
            onClick={() => {
              if (isSimulationActive) {
                onStopSimulation();
              } else {
                onUploadAndSimulate();
              }
            }}
            disabled={simulationDisabled}
            className={`min-h-9 rounded-[12px] border px-3 py-2 text-xs text-white transition-opacity ${
              isSimulationActive
                ? 'border-rose-400/30 bg-[linear-gradient(135deg,#e2567b_0%,#cc466c_100%)] hover:opacity-90'
                : 'border-indigo-400/30 bg-[linear-gradient(135deg,var(--ide-accent-from),var(--ide-accent-to))] hover:opacity-90'
            }`}
          >
            {isSimulationBusy && !isSimulationActive
              ? 'Preparing…'
              : isSimulationActive
                ? 'Stop'
                : 'Simulate'}
          </Button>
          <Button
            variant='secondary'
            icon={<Settings2 size={14} />}
            onClick={onOpenPreferences}
            className='min-h-9 rounded-[12px] border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white hover:border-white/16 hover:bg-white/[0.08] hover:text-white'
          >
            Preferences
          </Button>
          <ThemeToggle className='h-9 rounded-[12px] border-white/10 bg-white/[0.04] px-2.5 text-white hover:border-white/16 hover:bg-white/[0.08]' />
        </div>
      </div>
    </motion.header>
  );
}





