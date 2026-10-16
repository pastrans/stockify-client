import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ExportSettings, UpdateExportSettingsRequest } from '../../shared/models/export-settings.model';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/settings`;

  getExportSettings(): Observable<ExportSettings> {
    return this.http.get<ExportSettings>(`${this.apiUrl}/export`);
  }

  updateExportSettings(data: UpdateExportSettingsRequest): Observable<ExportSettings> {
    return this.http.put<ExportSettings>(`${this.apiUrl}/export`, data);
  }
}
