import { Injectable } from '@nestjs/common';

export type MetricLabels = Record<string, string | number | undefined>;

interface CounterSeries {
  help: string;
  values: Map<string, number>;
}

interface HistogramData {
  counts: number[];
  sum: number;
  count: number;
}

interface HistogramSeries {
  help: string;
  buckets: number[];
  values: Map<string, HistogramData>;
}

const DEFAULT_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, CounterSeries>();
  private readonly histograms = new Map<string, HistogramSeries>();

  increment(name: string, labels: MetricLabels = {}, value = 1): void {
    const series = this.getCounter(name);
    const key = this.serializeLabels(labels);
    series.values.set(key, (series.values.get(key) ?? 0) + value);
  }

  observe(
    name: string,
    value: number,
    labels: MetricLabels = {},
    buckets = DEFAULT_BUCKETS,
  ): void {
    if (!Number.isFinite(value)) {
      return;
    }

    const series = this.getHistogram(name, buckets);
    const key = this.serializeLabels(labels);
    const current = series.values.get(key) ?? {
      counts: buckets.map(() => 0),
      sum: 0,
      count: 0,
    };

    current.sum += value;
    current.count += 1;

    for (let index = 0; index < buckets.length; index += 1) {
      if (value <= buckets[index]) {
        current.counts[index] += 1;
      }
    }

    series.values.set(key, current);
  }

  render(): string {
    const lines: string[] = [];

    for (const [name, series] of this.counters) {
      lines.push(`# HELP ${name} ${series.help}`);
      lines.push(`# TYPE ${name} counter`);

      for (const [key, value] of series.values) {
        lines.push(`${name}${key} ${value}`);
      }
    }

    for (const [name, series] of this.histograms) {
      lines.push(`# HELP ${name} ${series.help}`);
      lines.push(`# TYPE ${name} histogram`);

      for (const [key, value] of series.values) {
        const labels = this.parseLabels(key);

        for (let index = 0; index < series.buckets.length; index += 1) {
          lines.push(
            `${name}_bucket${this.serializeLabels({
              ...labels,
              le: series.buckets[index],
            })} ${value.counts[index]}`,
          );
        }

        lines.push(
          `${name}_bucket${this.serializeLabels({
            ...labels,
            le: '+Inf',
          })} ${value.count}`,
        );
        lines.push(`${name}_sum${key} ${value.sum}`);
        lines.push(`${name}_count${key} ${value.count}`);
      }
    }

    lines.push('# HELP nodejs_process_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE nodejs_process_uptime_seconds gauge');
    lines.push(`nodejs_process_uptime_seconds ${process.uptime()}`);
    lines.push('# HELP nodejs_heap_used_bytes Heap used in bytes');
    lines.push('# TYPE nodejs_heap_used_bytes gauge');
    lines.push(`nodejs_heap_used_bytes ${process.memoryUsage().heapUsed}`);

    return `${lines.join('\n')}\n`;
  }

  private getCounter(name: string): CounterSeries {
    let series = this.counters.get(name);

    if (!series) {
      series = { help: `${name} counter`, values: new Map() };
      this.counters.set(name, series);
    }

    return series;
  }

  private getHistogram(name: string, buckets: number[]): HistogramSeries {
    let series = this.histograms.get(name);

    if (!series) {
      series = { help: `${name} histogram`, buckets, values: new Map() };
      this.histograms.set(name, series);
    }

    return series;
  }

  private serializeLabels(labels: MetricLabels): string {
    const entries = Object.entries(labels)
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}="${this.escape(String(value))}"`);

    return entries.length > 0 ? `{${entries.join(',')}}` : '';
  }

  private parseLabels(serialized: string): Record<string, string> {
    if (!serialized) {
      return {};
    }

    const body = serialized.slice(1, -1);
    const result: Record<string, string> = {};

    for (const part of body.split(',')) {
      const separator = part.indexOf('=');

      if (separator === -1) {
        continue;
      }

      result[part.slice(0, separator)] = part
        .slice(separator + 1)
        .replace(/^"|"$/g, '');
    }

    return result;
  }

  private escape(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }
}
