import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ExportSettings, UpdateExportSettingsRequest } from '../../shared/models/export-settings.model';
import { LabelSettings, UpdateLabelSettingsRequest } from '../../shared/models/label-settings.model';

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

  getLabelSettings(): Observable<LabelSettings> {
    return this.http.get<LabelSettings>(`${this.apiUrl}/labels`);
  }

  updateLabelSettings(data: UpdateLabelSettingsRequest): Observable<LabelSettings> {
    return this.http.put<LabelSettings>(`${this.apiUrl}/labels`, data);
  }
}
