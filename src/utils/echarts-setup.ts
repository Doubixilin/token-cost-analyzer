import * as echarts from "echarts/core";
import { LineChart, BarChart, ScatterChart, PieChart, HeatmapChart, SankeyChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  VisualMapComponent,
  CalendarComponent,
  DataZoomComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  PieChart,
  HeatmapChart,
  SankeyChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  VisualMapComponent,
  CalendarComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

export default echarts;
