import 'dart:math' as math;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/api_client.dart';

const _kCompanyPrimary = Color(0xFFAA8038);

class ProjectFileMetadataFieldConfig {
  final String id;
  final String key;
  final String label;
  final String type;
  final bool required;
  final String placeholder;
  final List<String> options;

  const ProjectFileMetadataFieldConfig({
    required this.id,
    required this.key,
    required this.label,
    required this.type,
    required this.required,
    required this.placeholder,
    required this.options,
  });

  factory ProjectFileMetadataFieldConfig.fromJson(Map<String, dynamic> json) {
    String text(dynamic value, [String fallback = ""]) {
      final result = value?.toString().trim() ?? "";
      return result.isEmpty ? fallback : result;
    }

    List<String> options(dynamic value) {
      if (value is! List) return const [];
      return value
          .map((item) => item?.toString().trim() ?? "")
          .where((item) => item.isNotEmpty)
          .toList();
    }

    final id = text(json["id"], "meta_${DateTime.now().microsecondsSinceEpoch}");
    final key = text(json["key"], id);
    return ProjectFileMetadataFieldConfig(
      id: id,
      key: key,
      label: text(json["label"], "Metadata"),
      type: text(json["type"], "text").toLowerCase(),
      required: json["required"] == true,
      placeholder: text(json["placeholder"]),
      options: options(json["options"]),
    );
  }
}

class ProjectFormFieldConfig {
  final String id;
  final String key;
  final String label;
  final String type;
  final String source;
  final String? coreKey;
  final bool enabled;
  final bool required;
  final int order;
  final String placeholder;
  final String helpText;
  final int layoutRow;
  final int layoutColumns;
  final int layoutColSpan;
  final List<String> options;
  final bool multiple;
  final String accept;
  final List<ProjectFileMetadataFieldConfig> metadataFields;

  const ProjectFormFieldConfig({
    required this.id,
    required this.key,
    required this.label,
    required this.type,
    required this.source,
    required this.coreKey,
    required this.enabled,
    required this.required,
    required this.order,
    required this.placeholder,
    required this.helpText,
    required this.layoutRow,
    required this.layoutColumns,
    required this.layoutColSpan,
    required this.options,
    required this.multiple,
    required this.accept,
    required this.metadataFields,
  });

  bool get isCore => source == "core";

  factory ProjectFormFieldConfig.fromJson(Map<String, dynamic> json) {
    String text(dynamic value, [String fallback = ""]) {
      final result = value?.toString().trim() ?? "";
      return result.isEmpty ? fallback : result;
    }

    int intInRange(dynamic value, int fallback, int min, int max) {
      final parsed = int.tryParse(value?.toString() ?? "");
      if (parsed == null) return fallback;
      return parsed.clamp(min, max) as int;
    }

    List<String> options(dynamic value) {
      if (value is! List) return const [];
      return value
          .map((item) => item?.toString().trim() ?? "")
          .where((item) => item.isNotEmpty)
          .toList();
    }

    List<ProjectFileMetadataFieldConfig> metadata(dynamic value) {
      if (value is! List) return const [];
      return value
          .whereType<Map>()
          .map((entry) => ProjectFileMetadataFieldConfig.fromJson(Map<String, dynamic>.from(entry)))
          .toList();
    }

    final id = text(json["id"], "field_${DateTime.now().microsecondsSinceEpoch}");
    final key = text(json["key"], id);
    final layoutColumns = intInRange(json["layoutColumns"], 1, 1, 4);
    return ProjectFormFieldConfig(
      id: id,
      key: key,
      label: text(json["label"], "Field"),
      type: text(json["type"], "text").toLowerCase(),
      source: text(json["source"], "custom").toLowerCase(),
      coreKey: text(json["coreKey"]).isEmpty ? null : text(json["coreKey"]).toLowerCase(),
      enabled: json["enabled"] != false,
      required: json["required"] == true,
      order: intInRange(json["order"], 100, 1, 500),
      placeholder: text(json["placeholder"]),
      helpText: text(json["helpText"]),
      layoutRow: intInRange(json["layoutRow"], intInRange(json["order"], 100, 1, 500), 1, 500),
      layoutColumns: layoutColumns,
      layoutColSpan: intInRange(json["layoutColSpan"], 1, 1, layoutColumns),
      options: options(json["options"]),
      multiple: json["multiple"] == true,
      accept: text(json["accept"]),
      metadataFields: metadata(json["metadataFields"]),
    );
  }
}

class ProjectFormSheetResult {
  final String action;
  final Map<String, dynamic>? payload;

  const ProjectFormSheetResult({
    required this.action,
    this.payload,
  });
}

List<ProjectFormFieldConfig> parseProjectFormFields(List<Map<String, dynamic>> rawFields) {
  final parsed = rawFields
      .map(ProjectFormFieldConfig.fromJson)
      .where((field) => field.enabled)
      .toList();
  final fields = parsed.isNotEmpty ? parsed : _defaultProjectFormFields();
  fields.sort((a, b) {
    if (a.layoutRow != b.layoutRow) return a.layoutRow.compareTo(b.layoutRow);
    return a.order.compareTo(b.order);
  });
  return fields;
}

List<ProjectFormFieldConfig> _defaultProjectFormFields() {
  return const [
    ProjectFormFieldConfig(
      id: "core_name",
      key: "name",
      label: "Company Name",
      type: "text",
      source: "core",
      coreKey: "name",
      enabled: true,
      required: true,
      order: 1,
      placeholder: "Enter company name",
      helpText: "",
      layoutRow: 1,
      layoutColumns: 1,
      layoutColSpan: 1,
      options: [],
      multiple: false,
      accept: "",
      metadataFields: [],
    ),
    ProjectFormFieldConfig(
      id: "core_description",
      key: "description",
      label: "Description",
      type: "textarea",
      source: "core",
      coreKey: "description",
      enabled: true,
      required: false,
      order: 2,
      placeholder: "Describe your company",
      helpText: "",
      layoutRow: 2,
      layoutColumns: 1,
      layoutColSpan: 1,
      options: [],
      multiple: false,
      accept: "",
      metadataFields: [],
    ),
    ProjectFormFieldConfig(
      id: "core_status",
      key: "status",
      label: "Status",
      type: "select",
      source: "core",
      coreKey: "status",
      enabled: true,
      required: true,
      order: 3,
      placeholder: "",
      helpText: "",
      layoutRow: 3,
      layoutColumns: 1,
      layoutColSpan: 1,
      options: ["active", "inactive"],
      multiple: false,
      accept: "",
      metadataFields: [],
    ),
  ];
}

List<Map<String, dynamic>> extractCompanyCategoriesFromProjects(List<dynamic> projects) {
  final map = <String, Map<String, dynamic>>{};
  for (final item in projects) {
    if (item is! Map) continue;
    final project = Map<String, dynamic>.from(item);
    final rawCategory = project["category"];
    if (rawCategory is! Map) continue;
    final category = Map<String, dynamic>.from(rawCategory);
    final id = (category["id"] ?? "").toString().trim();
    final name = (category["name"] ?? "").toString().trim();
    if (id.isEmpty || name.isEmpty) continue;
    map[id] = {"id": id, "name": name};
  }
  final list = map.values.toList();
  list.sort((a, b) => (a["name"] as String).compareTo(b["name"] as String));
  return list;
}

Future<ProjectFormSheetResult?> showProjectFormSheet({
  required BuildContext context,
  required ApiClient api,
  required List<ProjectFormFieldConfig> fields,
  required List<Map<String, dynamic>> categories,
  Map<String, dynamic>? initialProject,
  bool allowDelete = false,
}) {
  return showModalBottomSheet<ProjectFormSheetResult>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => _ProjectFormSheet(
      api: api,
      fields: fields,
      categories: categories,
      initialProject: initialProject,
      allowDelete: allowDelete,
    ),
  );
}

class _FormRow {
  final int row;
  final int columns;
  final List<ProjectFormFieldConfig> fields;

  const _FormRow({
    required this.row,
    required this.columns,
    required this.fields,
  });
}

class _ProjectFormSheet extends StatefulWidget {
  final ApiClient api;
  final List<ProjectFormFieldConfig> fields;
  final List<Map<String, dynamic>> categories;
  final Map<String, dynamic>? initialProject;
  final bool allowDelete;

  const _ProjectFormSheet({
    required this.api,
    required this.fields,
    required this.categories,
    required this.initialProject,
    required this.allowDelete,
  });

  @override
  State<_ProjectFormSheet> createState() => _ProjectFormSheetState();
}

class _ProjectFormSheetState extends State<_ProjectFormSheet> {
  late final TextEditingController _nameCtrl;
  late final TextEditingController _descriptionCtrl;
  final Map<String, dynamic> _customValues = <String, dynamic>{};
  bool _saving = false;
  String? _uploadingFieldKey;

  String _status = "active";
  String? _categoryId;
  DateTime? _startDate;
  DateTime? _endDate;

  List<ProjectFormFieldConfig> get _enabledFields => widget.fields;
  bool get _isEdit => widget.initialProject != null;

  @override
  void initState() {
    super.initState();
    final initial = widget.initialProject ?? const <String, dynamic>{};
    _nameCtrl = TextEditingController(text: _string(initial["name"]));
    _descriptionCtrl = TextEditingController(text: _string(initial["description"]));
    _status = _normalizeStatus(_string(initial["status"]));
    final category = initial["category"];
    if (category is Map && (category["id"]?.toString().trim().isNotEmpty ?? false)) {
      _categoryId = category["id"].toString().trim();
    }
    _startDate = _parseDate(initial["startDate"]);
    _endDate = _parseDate(initial["endDate"]);

    final customData = initial["customData"];
    if (customData is Map) {
      for (final entry in customData.entries) {
        _customValues[entry.key.toString()] = entry.value;
      }
    }
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _descriptionCtrl.dispose();
    super.dispose();
  }

  String _string(dynamic value) => value?.toString().trim() ?? "";

  DateTime? _parseDate(dynamic value) {
    final raw = _string(value);
    if (raw.isEmpty) return null;
    return DateTime.tryParse(raw)?.toLocal();
  }

  String _normalizeStatus(String value) {
    final normalized = value.toLowerCase();
    if (normalized == "active") return "active";
    if (normalized == "inactive" || normalized == "archived" || normalized == "completed") {
      return "inactive";
    }
    return "active";
  }

  List<_FormRow> get _rows {
    final map = <int, _FormRow>{};
    for (final field in _enabledFields) {
      final row = field.layoutRow.clamp(1, 500) as int;
      final columns = field.layoutColumns.clamp(1, 4) as int;
      final existing = map[row];
      if (existing == null) {
        map[row] = _FormRow(row: row, columns: columns, fields: [field]);
      } else {
        existing.fields.add(field);
      }
    }
    final rows = map.values.toList()
      ..sort((a, b) => a.row.compareTo(b.row));
    for (final row in rows) {
      row.fields.sort((a, b) => a.order.compareTo(b.order));
    }
    return rows;
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  Future<DateTime?> _pickDate(DateTime? initial) async {
    final now = DateTime.now();
    return showDatePicker(
      context: context,
      initialDate: initial ?? now,
      firstDate: DateTime(now.year - 20),
      lastDate: DateTime(now.year + 20),
    );
  }

  Future<DateTime?> _pickDateTime(DateTime? initial) async {
    final pickedDate = await _pickDate(initial);
    if (pickedDate == null) return null;
    if (!mounted) return null;
    final pickedTime = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initial ?? DateTime.now()),
    );
    if (pickedTime == null) {
      return DateTime(pickedDate.year, pickedDate.month, pickedDate.day);
    }
    return DateTime(
      pickedDate.year,
      pickedDate.month,
      pickedDate.day,
      pickedTime.hour,
      pickedTime.minute,
    );
  }

  String _formatDate(DateTime? value) {
    if (value == null) return "";
    return DateFormat("MMM d, y").format(value);
  }

  String _formatDateTime(DateTime? value) {
    if (value == null) return "";
    return DateFormat("MMM d, y - h:mm a").format(value);
  }

  List<Map<String, dynamic>> _fileEntries(ProjectFormFieldConfig field) {
    final raw = _customValues[field.key];
    if (raw is! List) return <Map<String, dynamic>>[];
    return raw
        .whereType<Map>()
        .map((entry) => Map<String, dynamic>.from(entry))
        .toList();
  }

  Future<void> _pickAndUpload(ProjectFormFieldConfig field) async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: field.multiple,
      withData: false,
      type: field.accept.trim().isNotEmpty ? FileType.custom : FileType.any,
      allowedExtensions: field.accept.trim().isNotEmpty
          ? field.accept
              .split(",")
              .map((ext) => ext.trim().replaceAll(".", ""))
              .where((ext) => ext.isNotEmpty && !ext.contains("/"))
              .toList()
          : null,
    );
    if (result == null || result.files.isEmpty) return;

    setState(() => _uploadingFieldKey = field.key);
    try {
      final nextFiles = field.multiple ? _fileEntries(field) : <Map<String, dynamic>>[];
      for (final picked in result.files) {
        final path = picked.path;
        if (path == null || path.trim().isEmpty) continue;
        final uploaded = await widget.api.uploadProjectFormFile(
          filePath: path,
          fileName: picked.name,
          mimeType: picked.mimeType,
          fileSize: picked.size,
        );
        nextFiles.add({
          "url": _string(uploaded["url"]),
          "fileName": _string(uploaded["fileName"]).isNotEmpty
              ? _string(uploaded["fileName"])
              : picked.name,
          "size": uploaded["size"] ?? picked.size,
          "mimeType": _string(uploaded["mimeType"]).isNotEmpty
              ? _string(uploaded["mimeType"])
              : (picked.mimeType ?? "application/octet-stream"),
          "metadata": <String, dynamic>{},
        });
        if (!field.multiple) break;
      }
      if (!mounted) return;
      setState(() {
        if (nextFiles.isEmpty) {
          _customValues.remove(field.key);
        } else {
          _customValues[field.key] = nextFiles;
        }
      });
    } catch (e) {
      if (!mounted) return;
      _showError(e.toString());
    } finally {
      if (mounted) setState(() => _uploadingFieldKey = null);
    }
  }

  String? _validateRequired() {
    for (final field in _enabledFields) {
      if (!field.required) continue;
      if (field.isCore) {
        switch (field.coreKey) {
          case "name":
            if (_nameCtrl.text.trim().isEmpty) return "${field.label} is required";
            break;
          case "description":
            if (_descriptionCtrl.text.trim().isEmpty) return "${field.label} is required";
            break;
          case "categoryid":
            if ((_categoryId ?? "").isEmpty) return "${field.label} is required";
            break;
          case "status":
            if (_status.trim().isEmpty) return "${field.label} is required";
            break;
          case "startdate":
            if (_startDate == null) return "${field.label} is required";
            break;
          case "enddate":
            if (_endDate == null) return "${field.label} is required";
            break;
        }
        continue;
      }

      final value = _customValues[field.key];
      if (value == null || (value is String && value.trim().isEmpty)) {
        return "${field.label} is required";
      }
      if (field.type == "multiselect" && (value is! List || value.isEmpty)) {
        return "${field.label} is required";
      }
      if (field.type == "file") {
        if (value is! List || value.isEmpty) return "${field.label} is required";
        for (final file in value.whereType<Map>()) {
          final metadata = file["metadata"] is Map
              ? Map<String, dynamic>.from(file["metadata"] as Map)
              : <String, dynamic>{};
          for (final metaField in field.metadataFields.where((item) => item.required)) {
            final metaValue = metadata[metaField.key];
            if (metaValue == null || _string(metaValue).isEmpty) {
              return "${field.label}: ${metaField.label} is required";
            }
          }
        }
      }
    }
    return null;
  }

  Map<String, dynamic> _buildCustomPayload() {
    final payload = <String, dynamic>{};
    for (final field in _enabledFields.where((item) => !item.isCore)) {
      final raw = _customValues[field.key];
      if (raw == null) continue;
      if (raw is String && raw.trim().isEmpty) continue;
      if (field.type == "number") {
        final parsed = num.tryParse(raw.toString());
        if (parsed != null) payload[field.key] = parsed;
        continue;
      }
      if (field.type == "date" || field.type == "datetime") {
        if (raw is DateTime) {
          payload[field.key] = raw.toIso8601String();
        } else if (_string(raw).isNotEmpty) {
          payload[field.key] = _string(raw);
        }
        continue;
      }
      if (field.type == "multiselect") {
        if (raw is List && raw.isNotEmpty) {
          payload[field.key] = raw.map((item) => item.toString()).toList();
        }
        continue;
      }
      payload[field.key] = raw;
    }
    return payload;
  }

  Future<void> _submit() async {
    final validationError = _validateRequired();
    if (validationError != null) {
      _showError(validationError);
      return;
    }

    setState(() => _saving = true);
    try {
      final payload = <String, dynamic>{
        "name": _nameCtrl.text.trim(),
        "description": _descriptionCtrl.text.trim().isEmpty ? null : _descriptionCtrl.text.trim(),
        "status": _status,
        "categoryId": (_categoryId ?? "").isEmpty ? null : _categoryId,
        "startDate": _startDate?.toIso8601String(),
        "endDate": _endDate?.toIso8601String(),
        "customData": _buildCustomPayload(),
      };
      if (!mounted) return;
      Navigator.of(context).pop(ProjectFormSheetResult(action: "save", payload: payload));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Widget _buildDateField({
    required String label,
    required DateTime? value,
    required String placeholder,
    required Future<void> Function() onTap,
    bool includeTime = false,
    String? helpText,
    bool required = false,
  }) {
    final formatted = includeTime ? _formatDateTime(value) : _formatDate(value);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          required ? "$label *" : label,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 6),
        InkWell(
          onTap: _saving ? null : onTap,
          borderRadius: BorderRadius.circular(10),
          child: InputDecorator(
            decoration: InputDecoration(
              border: const OutlineInputBorder(),
              suffixIcon: const Icon(Icons.calendar_today_rounded),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            ),
            child: Text(
              formatted.isEmpty ? placeholder : formatted,
              style: TextStyle(
                color: formatted.isEmpty ? Colors.grey.shade500 : null,
              ),
            ),
          ),
        ),
        if (helpText != null && helpText.trim().isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(
            helpText,
            style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
          ),
        ],
      ],
    );
  }

  Widget _buildField(ProjectFormFieldConfig field) {
    final label = field.required ? "${field.label} *" : field.label;
    final helpText = field.helpText.trim();

    if (field.isCore) {
      switch (field.coreKey) {
        case "name":
          return TextField(
            controller: _nameCtrl,
            enabled: !_saving,
            decoration: InputDecoration(
              labelText: label,
              hintText: field.placeholder.isNotEmpty ? field.placeholder : "Enter company name",
              border: const OutlineInputBorder(),
              helperText: helpText.isEmpty ? null : helpText,
            ),
          );
        case "description":
          return TextField(
            controller: _descriptionCtrl,
            enabled: !_saving,
            minLines: 4,
            maxLines: 8,
            decoration: InputDecoration(
              labelText: label,
              hintText: field.placeholder.isNotEmpty ? field.placeholder : "Describe this company",
              border: const OutlineInputBorder(),
              helperText: helpText.isEmpty ? null : helpText,
            ),
          );
        case "categoryid":
          final selected = (_categoryId ?? "").isEmpty ? null : _categoryId;
          return DropdownButtonFormField<String>(
            value: selected,
            decoration: InputDecoration(
              labelText: label,
              border: const OutlineInputBorder(),
              helperText: helpText.isEmpty ? null : helpText,
            ),
            items: widget.categories
                .map(
                  (category) => DropdownMenuItem<String>(
                    value: category["id"]?.toString(),
                    child: Text(category["name"]?.toString() ?? "Category"),
                  ),
                )
                .toList(),
            onChanged: _saving
                ? null
                : (value) => setState(() {
                      _categoryId = value;
                    }),
          );
        case "status":
          return DropdownButtonFormField<String>(
            value: _status,
            decoration: InputDecoration(
              labelText: label,
              border: const OutlineInputBorder(),
              helperText: helpText.isEmpty ? null : helpText,
            ),
            items: const [
              DropdownMenuItem(value: "active", child: Text("Active")),
              DropdownMenuItem(value: "inactive", child: Text("Inactive")),
            ],
            onChanged: _saving
                ? null
                : (value) {
                    if (value == null) return;
                    setState(() => _status = value);
                  },
          );
        case "startdate":
          return _buildDateField(
            label: label,
            value: _startDate,
            placeholder: field.placeholder.isNotEmpty ? field.placeholder : "Select start date",
            includeTime: false,
            helpText: helpText.isEmpty ? null : helpText,
            required: field.required,
            onTap: () async {
              final picked = await _pickDate(_startDate);
              if (picked == null || !mounted) return;
              setState(() => _startDate = picked);
            },
          );
        case "enddate":
          return _buildDateField(
            label: label,
            value: _endDate,
            placeholder: field.placeholder.isNotEmpty ? field.placeholder : "Select end date",
            includeTime: false,
            helpText: helpText.isEmpty ? null : helpText,
            required: field.required,
            onTap: () async {
              final picked = await _pickDate(_endDate);
              if (picked == null || !mounted) return;
              setState(() => _endDate = picked);
            },
          );
      }
    }

    final value = _customValues[field.key];

    if (field.type == "checkbox") {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(label),
            value: value == true,
            activeColor: _kCompanyPrimary,
            onChanged: _saving
                ? null
                : (checked) => setState(() {
                      _customValues[field.key] = checked;
                    }),
          ),
          if (helpText.isNotEmpty)
            Text(helpText, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
        ],
      );
    }

    if (field.type == "select") {
      final selected = value?.toString();
      final options = [...field.options];
      if (selected != null && selected.isNotEmpty && !options.contains(selected)) {
        options.add(selected);
      }
      return DropdownButtonFormField<String>(
        value: selected?.isEmpty ?? true ? null : selected,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          helperText: helpText.isEmpty ? null : helpText,
        ),
        items: options
            .map((option) => DropdownMenuItem<String>(value: option, child: Text(option)))
            .toList(),
        onChanged: _saving
            ? null
            : (next) => setState(() {
                  if (next == null || next.trim().isEmpty) {
                    _customValues.remove(field.key);
                  } else {
                    _customValues[field.key] = next.trim();
                  }
                }),
      );
    }

    if (field.type == "multiselect") {
      final selected = value is List
          ? value.map((item) => item.toString()).toSet()
          : <String>{};
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: field.options.map((option) {
              final isSelected = selected.contains(option);
              return FilterChip(
                label: Text(option),
                selected: isSelected,
                selectedColor: _kCompanyPrimary.withValues(alpha: 0.18),
                onSelected: _saving
                    ? null
                    : (checked) => setState(() {
                          if (checked) {
                            selected.add(option);
                          } else {
                            selected.remove(option);
                          }
                          if (selected.isEmpty) {
                            _customValues.remove(field.key);
                          } else {
                            _customValues[field.key] = selected.toList();
                          }
                        }),
              );
            }).toList(),
          ),
          if (helpText.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(helpText, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
          ],
        ],
      );
    }

    if (field.type == "date" || field.type == "datetime") {
      final parsed = value is DateTime ? value : _parseDate(value);
      return _buildDateField(
        label: label,
        value: parsed,
        placeholder: field.placeholder.isNotEmpty
            ? field.placeholder
            : (field.type == "datetime" ? "Select date and time" : "Select date"),
        includeTime: field.type == "datetime",
        helpText: helpText.isEmpty ? null : helpText,
        required: field.required,
        onTap: () async {
          final picked = field.type == "datetime"
              ? await _pickDateTime(parsed)
              : await _pickDate(parsed);
          if (picked == null || !mounted) return;
          setState(() => _customValues[field.key] = picked);
        },
      );
    }

    if (field.type == "file") {
      final files = _fileEntries(field);
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          OutlinedButton.icon(
            onPressed: (_saving || _uploadingFieldKey == field.key)
                ? null
                : () => _pickAndUpload(field),
            icon: _uploadingFieldKey == field.key
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.attach_file_rounded),
            label: Text(_uploadingFieldKey == field.key ? "Uploading..." : "Attach file"),
          ),
          if (files.isNotEmpty) ...[
            const SizedBox(height: 8),
            ...files.asMap().entries.map((entry) {
              final index = entry.key;
              final file = entry.value;
              final metadata = file["metadata"] is Map
                  ? Map<String, dynamic>.from(file["metadata"] as Map)
                  : <String, dynamic>{};
              return Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              _string(file["fileName"]).isNotEmpty
                                  ? _string(file["fileName"])
                                  : "Uploaded file",
                              style: const TextStyle(fontWeight: FontWeight.w600),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          IconButton(
                            onPressed: _saving
                                ? null
                                : () => setState(() {
                                      final next = [...files]..removeAt(index);
                                      if (next.isEmpty) {
                                        _customValues.remove(field.key);
                                      } else {
                                        _customValues[field.key] = next;
                                      }
                                    }),
                            icon: const Icon(Icons.delete_outline_rounded),
                          ),
                        ],
                      ),
                      if (field.metadataFields.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        ...field.metadataFields.map((metaField) {
                          final metaValue = metadata[metaField.key];
                          final metaLabel = metaField.required
                              ? "${metaField.label} *"
                              : metaField.label;
                          Widget input;
                          if (metaField.type == "checkbox") {
                            input = SwitchListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text(metaLabel),
                              value: metaValue == true,
                              onChanged: _saving
                                  ? null
                                  : (checked) => setState(() {
                                        metadata[metaField.key] = checked;
                                        file["metadata"] = metadata;
                                        files[index] = file;
                                        _customValues[field.key] = files;
                                      }),
                            );
                          } else if (metaField.type == "select") {
                            input = DropdownButtonFormField<String>(
                              value: _string(metaValue).isEmpty ? null : _string(metaValue),
                              decoration: InputDecoration(
                                labelText: metaLabel,
                                border: const OutlineInputBorder(),
                              ),
                              items: metaField.options
                                  .map(
                                    (option) => DropdownMenuItem<String>(
                                      value: option,
                                      child: Text(option),
                                    ),
                                  )
                                  .toList(),
                              onChanged: _saving
                                  ? null
                                  : (next) => setState(() {
                                        metadata[metaField.key] = next ?? "";
                                        file["metadata"] = metadata;
                                        files[index] = file;
                                        _customValues[field.key] = files;
                                      }),
                            );
                          } else {
                            input = TextFormField(
                              key: ValueKey("${field.key}_${index}_${metaField.key}"),
                              enabled: !_saving,
                              initialValue: _string(metaValue),
                              decoration: InputDecoration(
                                labelText: metaLabel,
                                border: const OutlineInputBorder(),
                                hintText: metaField.placeholder.isNotEmpty
                                    ? metaField.placeholder
                                    : null,
                              ),
                              onChanged: (next) => setState(() {
                                metadata[metaField.key] = next;
                                file["metadata"] = metadata;
                                files[index] = file;
                                _customValues[field.key] = files;
                              }),
                            );
                          }
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: input,
                          );
                        }),
                      ],
                    ],
                  ),
                ),
              );
            }),
          ],
          if (helpText.isNotEmpty)
            Text(helpText, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
        ],
      );
    }

    final text = value is DateTime ? _formatDateTime(value) : _string(value);
    final keyboardType = switch (field.type) {
      "number" => const TextInputType.numberWithOptions(decimal: true),
      "email" => TextInputType.emailAddress,
      "phone" => TextInputType.phone,
      "url" => TextInputType.url,
      _ => TextInputType.text,
    };
    final maxLines = field.type == "textarea" || field.type == "rich_text" ? 6 : 1;

    return TextFormField(
      key: ValueKey(field.key),
      enabled: !_saving,
      initialValue: text,
      keyboardType: keyboardType,
      minLines: maxLines > 1 ? 3 : 1,
      maxLines: maxLines,
      decoration: InputDecoration(
        labelText: label,
        hintText: field.placeholder.isNotEmpty ? field.placeholder : null,
        border: const OutlineInputBorder(),
        helperText: helpText.isEmpty ? null : helpText,
      ),
      onChanged: (next) => setState(() {
        if (next.trim().isEmpty) {
          _customValues.remove(field.key);
        } else {
          _customValues[field.key] = next;
        }
      }),
    );
  }

  Widget _buildRow(_FormRow row) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final maxWidth = constraints.maxWidth;
        final effectiveColumns = maxWidth < 720
            ? 1
            : maxWidth < 1024
                ? math.min(row.columns, 2)
                : row.columns;
        const gap = 12.0;
        final cellWidth = effectiveColumns == 1
            ? maxWidth
            : (maxWidth - (effectiveColumns - 1) * gap) / effectiveColumns;

        return Wrap(
          spacing: gap,
          runSpacing: gap,
          children: row.fields.map((field) {
            final span = effectiveColumns == 1
                ? 1
                : field.layoutColSpan.clamp(1, effectiveColumns) as int;
            final fieldWidth = effectiveColumns == 1
                ? maxWidth
                : (cellWidth * span) + (gap * (span - 1));
            return SizedBox(
              width: fieldWidth,
              child: _buildField(field),
            );
          }).toList(),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        16,
        12,
        16,
        MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.92,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 44,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Text(
                    _isEdit ? "Edit Company" : "Create Company",
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                ),
                if (widget.allowDelete && _isEdit)
                  TextButton.icon(
                    onPressed: _saving
                        ? null
                        : () => Navigator.of(context).pop(
                              const ProjectFormSheetResult(action: "delete"),
                            ),
                    icon: const Icon(Icons.delete_outline_rounded),
                    label: const Text("Delete"),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            Expanded(
              child: ListView.separated(
                itemCount: _rows.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (_, index) => _buildRow(_rows[index]),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                TextButton(
                  onPressed: _saving ? null : () => Navigator.of(context).pop(),
                  child: const Text("Cancel"),
                ),
                const Spacer(),
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: _kCompanyPrimary,
                    foregroundColor: Colors.white,
                  ),
                  onPressed: _saving ? null : _submit,
                  icon: _saving
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.save_rounded),
                  label: Text(_isEdit ? "Save" : "Create"),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
