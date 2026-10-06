export class LyricFocusController {
  private frozenIndex: number | null = null;

  resolve(activeIndex: number, suspended: boolean): number {
    if (suspended) {
      if (this.frozenIndex === null) this.frozenIndex = Math.max(0, activeIndex);
      return this.frozenIndex;
    }
    this.frozenIndex = null;
    return activeIndex;
  }

  reset(): void {
    this.frozenIndex = null;
  }
}
