import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LoadingService {
  private readonly _loading = signal<boolean>(false);

  readonly isLoading = this._loading.asReadonly();

  setLoading(val: boolean) {
    this._loading.set(val);
  }

  toggle() {
    this._loading.update((v) => !v);
  }
}
