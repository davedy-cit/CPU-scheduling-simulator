/**
 * The dashboard.
 *
 * The page is a projection of one precomputed run. `SimulationProvider` holds
 * the timeline and the playback cursor; every panel below reads from context and
 * derives what it shows from `(timeline, cursor)`. No panel owns simulation
 * state, which is why the process table, the event log and the timelines can
 * never disagree about what time it is.
 *
 * Vertical order follows the reader's question: what is happening now (the flow
 * board), when did it happen (the timelines), and what did it cost (the table,
 * the trace and the summary).
 */

import { Legend } from './components/Legend.jsx';
import { ComparePanel } from './components/compare/ComparePanel.jsx';
import { ControlBar } from './components/controls/ControlBar.jsx';
import { WorkloadEditor } from './components/editor/WorkloadEditor.jsx';
import { ProcessFlowBoard } from './components/flow/ProcessFlowBoard.jsx';
import { GanttChart } from './components/gantt/GanttChart.jsx';
import { KpiRow, OccupancyStrip } from './components/kpi/KpiRow.jsx';
import { AppShell } from './components/layout/AppShell.jsx';
import { EventLog } from './components/log/EventLog.jsx';
import { ProcessHistory } from './components/log/ProcessHistory.jsx';
import { SummaryPanel } from './components/summary/SummaryPanel.jsx';
import { MetricsTable } from './components/tables/MetricsTable.jsx';
import { ProcessTable } from './components/tables/ProcessTable.jsx';
import { SimulationProvider } from './state/SimulationContext.jsx';

export default function App() {
  return (
    <SimulationProvider>
      <AppShell>
        <ControlBar />
        <KpiRow />
        <OccupancyStrip />
        <ProcessFlowBoard />
        <GanttChart />
        <ProcessTable />
        <MetricsTable />
        <ComparePanel />
        <WorkloadEditor />

        <div className="grid gap-4 lg:grid-cols-3">
          <EventLog />
          <ProcessHistory />
          <SummaryPanel />
        </div>

        <Legend />
      </AppShell>
    </SimulationProvider>
  );
}
