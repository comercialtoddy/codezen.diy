import { atom, map } from 'nanostores';
import type { MapStore } from 'nanostores';
import { type DiagnosticItem } from '~/components/workbench/diagnostics/DiagnosticsPanel';

export class DiagnosticsStore {
  isOpen = atom<boolean>(false);

  // Diagnostics by file path
  diagnostics: MapStore<Record<string, DiagnosticItem[]>> = map({});

  toggleDiagnosticsPanel(value?: boolean) {
    const currentValue = this.isOpen.get();
    this.isOpen.set(value !== undefined ? value : !currentValue);
  }

  addDiagnostic(diagnostic: DiagnosticItem) {
    const fileDiagnostics = this.diagnostics.get()[diagnostic.filePath] || [];

    // Check if diagnostic with same id already exists
    const existingIndex = fileDiagnostics.findIndex((d) => d.id === diagnostic.id);

    if (existingIndex !== -1) {
      // Update existing diagnostic
      fileDiagnostics[existingIndex] = diagnostic;
    } else {
      // Add new diagnostic
      fileDiagnostics.push(diagnostic);
    }

    this.diagnostics.setKey(diagnostic.filePath, fileDiagnostics);
  }

  removeDiagnostic(filePath: string, diagnosticId: string) {
    const fileDiagnostics = this.diagnostics.get()[filePath] || [];
    const updatedDiagnostics = fileDiagnostics.filter((d) => d.id !== diagnosticId);

    this.diagnostics.setKey(filePath, updatedDiagnostics);
  }

  clearDiagnostics(filePath?: string) {
    if (filePath) {
      this.diagnostics.setKey(filePath, []);
    } else {
      this.diagnostics.set({});
    }
  }

  getDiagnostics(filePath?: string): DiagnosticItem[] {
    const allDiagnostics = this.diagnostics.get();

    if (filePath) {
      return allDiagnostics[filePath] || [];
    }

    // Return all diagnostics flattened into a single array
    return Object.values(allDiagnostics).flat();
  }

  getFilesWithDiagnostics(severity?: DiagnosticItem['severity']): string[] {
    const allDiagnostics = this.diagnostics.get();

    if (severity) {
      return Object.entries(allDiagnostics)
        .filter(([_, diagnostics]) => diagnostics.some((d) => d.severity === severity))
        .map(([filePath]) => filePath);
    }

    return Object.keys(allDiagnostics).filter(
      (filePath) => allDiagnostics[filePath] && allDiagnostics[filePath].length > 0,
    );
  }

  countDiagnostics(severity?: DiagnosticItem['severity']): number {
    const allDiagnostics = this.getDiagnostics();

    if (severity) {
      return allDiagnostics.filter((d) => d.severity === severity).length;
    }

    return allDiagnostics.length;
  }
}

export const diagnosticsStore = new DiagnosticsStore();
