# Loan Calculator, Attendance & My Profile Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement three remaining home screen features: Loan Calculator (amortization), Attendance (GPS check-in/out), and My Profile (user info management).

**Architecture:** Feature-based folder structure following existing patterns. Uses Riverpod for state management, Hive for local storage, and go_router for navigation. Each feature is implemented as a complete vertical slice before moving to the next.

**Tech Stack:** Flutter, Riverpod, Hive, go_router, lucide_icons, geolocator/geocoding

---

## Slice 1: Loan Calculator - Data Model & Service

**Duration:** ~30 minutes
**Deliverable:** Loan calculation model with amortization logic

### Task 1.1: Create Loan Calculation Model

**Files:**
- Create: `lib/features/calculator/data/models/loan_calculation.dart`

**Step 1: Create the loan calculation model**

```dart
/// Loan calculation model with amortization schedule
class LoanCalculation {
  final double principal;
  final double annualRate;
  final int termMonths;
  final double monthlyPayment;
  final double totalInterest;
  final double totalAmount;
  final List<AmortizationEntry> schedule;

  LoanCalculation({
    required this.principal,
    required this.annualRate,
    required this.termMonths,
    required this.monthlyPayment,
    required this.totalInterest,
    required this.totalAmount,
    required this.schedule,
  });
}

class AmortizationEntry {
  final int month;
  final double payment;
  final double principal;
  final double interest;
  final double balance;

  AmortizationEntry({
    required this.month,
    required this.payment,
    required this.principal,
    required this.interest,
    required this.balance,
  });
}
```

**Step 2: Create the loan calculator service**

**Files:**
- Create: `lib/features/calculator/data/services/loan_calculator_service.dart`

```dart
import '../models/loan_calculation.dart';

/// Service for calculating loan payments and amortization schedules
class LoanCalculatorService {
  /// Calculate monthly payment using amortization formula
  /// M = P × [r(1+r)^n] / [(1+r)^n – 1]
  double calculateMonthlyPayment(double principal, double annualRate, int termMonths) {
    if (principal <= 0 || termMonths <= 0) return 0;
    if (annualRate <= 0) return principal / termMonths;

    final monthlyRate = annualRate / 12 / 100;
    final factor = (1 + monthlyRate);
    final factorPow = _pow(factor, termMonths);

    return principal * (monthlyRate * factorPow) / (factorPow - 1);
  }

  /// Calculate full loan details with amortization schedule
  LoanCalculation calculate(double principal, double annualRate, int termMonths) {
    final monthlyPayment = calculateMonthlyPayment(principal, annualRate, termMonths);
    final totalAmount = monthlyPayment * termMonths;
    final totalInterest = totalAmount - principal;
    final schedule = _generateSchedule(principal, annualRate, termMonths, monthlyPayment);

    return LoanCalculation(
      principal: principal,
      annualRate: annualRate,
      termMonths: termMonths,
      monthlyPayment: monthlyPayment,
      totalInterest: totalInterest,
      totalAmount: totalAmount,
      schedule: schedule,
    );
  }

  /// Generate amortization schedule
  List<AmortizationEntry> _generateSchedule(
    double principal,
    double annualRate,
    int termMonths,
    double monthlyPayment,
  ) {
    final schedule = <AmortizationEntry>[];
    var balance = principal;
    final monthlyRate = annualRate / 12 / 100;

    for (var month = 1; month <= termMonths; month++) {
      final interest = balance * monthlyRate;
      final principalPaid = monthlyPayment - interest;
      balance = (balance - principalPaid).clamp(0, double.infinity);

      schedule.add(AmortizationEntry(
        month: month,
        payment: monthlyPayment,
        principal: principalPaid,
        interest: interest,
        balance: balance,
      ));
    }

    return schedule;
  }

  /// Custom power function to avoid importing dart:math
  double _pow(double base, int exponent) {
    if (exponent == 0) return 1;
    var result = base;
    for (var i = 1; i < exponent; i++) {
      result *= base;
    }
    return result;
  }
}
```

**Step 3: Commit**

```bash
git add lib/features/calculator/
git commit -m "feat(calculator): add loan calculation model and service"
```

---

## Slice 2: Loan Calculator - UI Page

**Duration:** ~1 hour
**Deliverable:** Calculator page with inputs, results, and amortization table

### Task 2.1: Create Loan Calculator Page

**Files:**
- Create: `lib/features/calculator/presentation/pages/loan_calculator_page.dart`

**Step 1: Create the calculator page**

```dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/utils/haptic_utils.dart';
import '../../data/models/loan_calculation.dart';
import '../../data/services/loan_calculator_service.dart';

class LoanCalculatorPage extends StatefulWidget {
  const LoanCalculatorPage({super.key});

  @override
  State<LoanCalculatorPage> createState() => _LoanCalculatorPageState();
}

class _LoanCalculatorPageState extends State<LoanCalculatorPage> {
  final _formKey = GlobalKey<FormState>();
  final _principalController = TextEditingController();
  final _rateController = TextEditingController();
  final _termController = TextEditingController();
  final _calculatorService = LoanCalculatorService();

  LoanCalculation? _result;
  bool _showSchedule = false;

  @override
  void dispose() {
    _principalController.dispose();
    _rateController.dispose();
    _termController.dispose();
    super.dispose();
  }

  void _calculate() {
    if (!_formKey.currentState!.validate()) return;

    HapticUtils.mediumImpact();

    final principal = double.parse(_principalController.text.replaceAll(',', ''));
    final rate = double.parse(_rateController.text);
    final term = int.parse(_termController.text);

    setState(() {
      _result = _calculatorService.calculate(principal, rate, term);
      _showSchedule = false;
    });
  }

  void _reset() {
    HapticUtils.lightImpact();
    _principalController.clear();
    _rateController.clear();
    _termController.clear();
    setState(() {
      _result = null;
      _showSchedule = false;
    });
  }

  String _formatCurrency(double value) {
    return '₱${value.toStringAsFixed(2).replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (Match m) => '${m[1]},',
    )}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => context.go('/home'),
        ),
        title: const Text('Loan Calculator'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Input Form
              _buildInputCard(),
              const SizedBox(height: 24),

              // Action Buttons
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _calculate,
                      icon: const Icon(LucideIcons.calculator),
                      label: const Text('Calculate'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF3B82F6),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  ElevatedButton.icon(
                    onPressed: _reset,
                    icon: const Icon(LucideIcons.refreshCw),
                    label: const Text('Reset'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.grey[200],
                      foregroundColor: Colors.grey[700],
                      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
                    ),
                  ),
                ],
              ),

              // Results
              if (_result != null) ...[
                const SizedBox(height: 32),
                _buildResultCard(),
                const SizedBox(height: 16),
                _buildScheduleCard(),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInputCard() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.grey[50],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey[200]!),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Loan Details',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 20),

          // Principal
          TextFormField(
            controller: _principalController,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(
              labelText: 'Principal Amount',
              prefixText: '₱ ',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
            ),
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            validator: (value) {
              if (value == null || value.isEmpty) return 'Enter principal amount';
              if (double.tryParse(value.replaceAll(',', '')) == null) return 'Invalid amount';
              return null;
            },
          ),
          const SizedBox(height: 16),

          // Interest Rate
          TextFormField(
            controller: _rateController,
            keyboardType: TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: 'Annual Interest Rate',
              suffixText: '%',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
            ),
            validator: (value) {
              if (value == null || value.isEmpty) return 'Enter interest rate';
              if (double.tryParse(value) == null) return 'Invalid rate';
              return null;
            },
          ),
          const SizedBox(height: 16),

          // Term
          TextFormField(
            controller: _termController,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(
              labelText: 'Loan Term',
              suffixText: 'months',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
            ),
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            validator: (value) {
              if (value == null || value.isEmpty) return 'Enter loan term';
              if (int.tryParse(value) == null) return 'Invalid term';
              return null;
            },
          ),
        ],
      ),
    );
  }

  Widget _buildResultCard() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF3B82F6).withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF3B82F6).withOpacity(0.3)),
      ),
      child: Column(
        children: [
          Text(
            _formatCurrency(_result!.monthlyPayment),
            style: const TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.bold,
              color: Color(0xFF3B82F6),
            ),
          ),
          const Text(
            'Monthly Payment',
            style: TextStyle(color: Colors.grey),
          ),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildResultItem('Total Interest', _formatCurrency(_result!.totalInterest)),
              Container(width: 1, height: 40, color: Colors.grey[300]),
              _buildResultItem('Total Amount', _formatCurrency(_result!.totalAmount)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildResultItem(String label, String value) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        Text(label, style: TextStyle(fontSize: 12, color: Colors.grey[600])),
      ],
    );
  }

  Widget _buildScheduleCard() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.grey[50],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey[200]!),
      ),
      child: Column(
        children: [
          InkWell(
            onTap: () {
              HapticUtils.lightImpact();
              setState(() => _showSchedule = !_showSchedule);
            },
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Amortization Schedule',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  Icon(_showSchedule ? LucideIcons.chevronUp : LucideIcons.chevronDown),
                ],
              ),
            ),
          ),
          if (_showSchedule)
            Container(
              constraints: const BoxConstraints(maxHeight: 300),
              child: SingleChildScrollView(
                child: Table(
                  border: TableBorder(
                    horizontalInside: BorderSide(color: Colors.grey[200]!),
                  ),
                  defaultVerticalAlignment: TableCellVerticalAlignment.middle,
                  columnWidths: const {
                    0: FlexColumnWidth(1),
                    1: FlexColumnWidth(2),
                    2: FlexColumnWidth(2),
                    3: FlexColumnWidth(2),
                  },
                  children: [
                    TableRow(
                      decoration: BoxDecoration(color: Colors.grey[100]),
                      children: const [
                        Padding(
                          padding: EdgeInsets.all(8),
                          child: Text('Mo.', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
                        ),
                        Padding(
                          padding: EdgeInsets.all(8),
                          child: Text('Principal', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
                        ),
                        Padding(
                          padding: EdgeInsets.all(8),
                          child: Text('Interest', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
                        ),
                        Padding(
                          padding: EdgeInsets.all(8),
                          child: Text('Balance', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
                        ),
                      ],
                    ),
                    ..._result!.schedule.map((entry) => TableRow(
                      children: [
                        Padding(
                          padding: const EdgeInsets.all(8),
                          child: Text('${entry.month}', style: const TextStyle(fontSize: 12)),
                        ),
                        Padding(
                          padding: const EdgeInsets.all(8),
                          child: Text(_formatCurrency(entry.principal), style: const TextStyle(fontSize: 12)),
                        ),
                        Padding(
                          padding: const EdgeInsets.all(8),
                          child: Text(_formatCurrency(entry.interest), style: const TextStyle(fontSize: 12)),
                        ),
                        Padding(
                          padding: const EdgeInsets.all(8),
                          child: Text(_formatCurrency(entry.balance), style: const TextStyle(fontSize: 12)),
                        ),
                      ],
                    )),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
```

**Step 2: Add route to app_router.dart**

Add import:
```dart
import '../../features/calculator/presentation/pages/loan_calculator_page.dart';
```

Add route before debug route:
```dart
// Calculator route
GoRoute(
  path: '/calculator',
  builder: (context, state) => const LoanCalculatorPage(),
),
```

**Step 3: Update home_page.dart navigation**

Add case in `_handleNavigation`:
```dart
case 'calculator':
  context.push('/calculator');
  break;
```

**Step 4: Commit**

```bash
git add lib/features/calculator/ lib/core/router/app_router.dart lib/features/home/presentation/pages/home_page.dart
git commit -m "feat(calculator): add loan calculator page with amortization schedule"
```

---

## Slice 3: Attendance - Data Model & Provider

**Duration:** ~45 minutes
**Deliverable:** Attendance model with GPS location, providers, and Hive storage

### Task 3.1: Create Attendance Model

**Files:**
- Create: `lib/features/attendance/data/models/attendance_record.dart`

```dart
/// Attendance record with GPS location tracking
class AttendanceRecord {
  final String id;
  final String userId;
  final DateTime date;
  final DateTime? checkInTime;
  final DateTime? checkOutTime;
  final AttendanceLocation? checkInLocation;
  final AttendanceLocation? checkOutLocation;
  final AttendanceStatus status;

  AttendanceRecord({
    required this.id,
    required this.userId,
    required this.date,
    this.checkInTime,
    this.checkOutTime,
    this.checkInLocation,
    this.checkOutLocation,
    required this.status,
  });

  double? get totalHours {
    if (checkInTime == null || checkOutTime == null) return null;
    return checkOutTime!.difference(checkInTime!).inMinutes / 60;
  }

  String get formattedHours {
    final hours = totalHours;
    if (hours == null) return '--';
    final h = hours.floor();
    final m = ((hours - h) * 60).round();
    return '${h}h ${m}m';
  }

  AttendanceRecord copyWith({
    String? id,
    String? userId,
    DateTime? date,
    DateTime? checkInTime,
    DateTime? checkOutTime,
    AttendanceLocation? checkInLocation,
    AttendanceLocation? checkOutLocation,
    AttendanceStatus? status,
  }) {
    return AttendanceRecord(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      date: date ?? this.date,
      checkInTime: checkInTime ?? this.checkInTime,
      checkOutTime: checkOutTime ?? this.checkOutTime,
      checkInLocation: checkInLocation ?? this.checkInLocation,
      checkOutLocation: checkOutLocation ?? this.checkOutLocation,
      status: status ?? this.status,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'userId': userId,
    'date': date.toIso8601String(),
    'checkInTime': checkInTime?.toIso8601String(),
    'checkOutTime': checkOutTime?.toIso8601String(),
    'checkInLocation': checkInLocation?.toJson(),
    'checkOutLocation': checkOutLocation?.toJson(),
    'status': status.name,
  };

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) {
    return AttendanceRecord(
      id: json['id'] ?? '',
      userId: json['userId'] ?? '',
      date: DateTime.parse(json['date']),
      checkInTime: json['checkInTime'] != null ? DateTime.parse(json['checkInTime']) : null,
      checkOutTime: json['checkOutTime'] != null ? DateTime.parse(json['checkOutTime']) : null,
      checkInLocation: json['checkInLocation'] != null
          ? AttendanceLocation.fromJson(json['checkInLocation'])
          : null,
      checkOutLocation: json['checkOutLocation'] != null
          ? AttendanceLocation.fromJson(json['checkOutLocation'])
          : null,
      status: AttendanceStatus.values.firstWhere(
        (e) => e.name == json['status'],
        orElse: () => AttendanceStatus.absent,
      ),
    );
  }
}

enum AttendanceStatus {
  absent,      // No check-in
  checkedIn,   // Checked in but not out
  checkedOut,  // Complete day
  incomplete,  // Missing check-out from previous day
}

class AttendanceLocation {
  final double latitude;
  final double longitude;
  final String? address;
  final DateTime timestamp;

  AttendanceLocation({
    required this.latitude,
    required this.longitude,
    this.address,
    required this.timestamp,
  });

  Map<String, dynamic> toJson() => {
    'latitude': latitude,
    'longitude': longitude,
    'address': address,
    'timestamp': timestamp.toIso8601String(),
  };

  factory AttendanceLocation.fromJson(Map<String, dynamic> json) {
    return AttendanceLocation(
      latitude: json['latitude'] ?? 0,
      longitude: json['longitude'] ?? 0,
      address: json['address'],
      timestamp: json['timestamp'] != null
          ? DateTime.parse(json['timestamp'])
          : DateTime.now(),
    );
  }
}
```

### Task 3.2: Add Attendance Providers

**Files:**
- Modify: `lib/shared/providers/app_providers.dart`

Add import:
```dart
import '../../features/attendance/data/models/attendance_record.dart';
```

Add providers before the last `}`:
```dart
// ==================== Attendance Providers ====================

/// Attendance records box name
const _attendanceBox = 'attendance';

/// Today's attendance record
final todayAttendanceProvider = StateNotifierProvider<TodayAttendanceNotifier, AttendanceRecord?>((ref) {
  return TodayAttendanceNotifier(ref.watch(hiveServiceProvider));
});

/// Is user currently checked in
final isCheckedInProvider = Provider<bool>((ref) {
  final today = ref.watch(todayAttendanceProvider);
  return today?.status == AttendanceStatus.checkedIn;
});

/// Attendance history (last 14 days)
final attendanceHistoryProvider = FutureProvider<List<AttendanceRecord>>((ref) async {
  final hiveService = ref.watch(hiveServiceProvider);
  if (!hiveService.isInitialized) await hiveService.init();

  final records = <AttendanceRecord>[];
  final box = Hive.box<String>(_attendanceBox);

  final twoWeeksAgo = DateTime.now().subtract(const Duration(days: 14));

  for (final key in box.keys) {
    final data = box.get(key);
    if (data != null) {
      final record = AttendanceRecord.fromJson(
        Map<String, dynamic>.from(const JsonDecoder().convert(data)),
      );
      if (record.date.isAfter(twoWeeksAgo)) {
        records.add(record);
      }
    }
  }

  records.sort((a, b) => b.date.compareTo(a.date));
  return records;
});

/// Attendance stats for current month
final attendanceStatsProvider = Provider<Map<String, dynamic>>((ref) {
  final historyAsync = ref.watch(attendanceHistoryProvider);
  final now = DateTime.now();

  return historyAsync.when(
    data: (records) {
      final monthRecords = records.where((r) =>
        r.date.month == now.month && r.date.year == now.year
      ).toList();

      final completeDays = monthRecords.where((r) => r.status == AttendanceStatus.checkedOut).length;
      final totalHours = monthRecords.fold<double>(0, (sum, r) => sum + (r.totalHours ?? 0));

      return {
        'daysWorked': completeDays,
        'totalHours': totalHours.toStringAsFixed(1),
        'averageHours': completeDays > 0 ? (totalHours / completeDays).toStringAsFixed(1) : '0',
      };
    },
    loading: () => {'daysWorked': 0, 'totalHours': '0', 'averageHours': '0'},
    error: (_, __) => {'daysWorked': 0, 'totalHours': '0', 'averageHours': '0'},
  );
});

/// Today's Attendance Notifier
class TodayAttendanceNotifier extends StateNotifier<AttendanceRecord?> {
  final HiveService _hiveService;

  TodayAttendanceNotifier(this._hiveService) : super(null) {
    _loadToday();
  }

  Future<void> _loadToday() async {
    if (!_hiveService.isInitialized) await _hiveService.init();
    final today = _formatDate(DateTime.now());
    final box = Hive.box<String>(_attendanceBox);
    final data = box.get(today);

    if (data != null) {
      state = AttendanceRecord.fromJson(
        Map<String, dynamic>.from(const JsonDecoder().convert(data)),
      );
    } else {
      state = null;
    }
  }

  Future<void> checkIn(AttendanceLocation location) async {
    final now = DateTime.now();
    final userId = 'user-1'; // TODO: Get from auth provider

    final record = AttendanceRecord(
      id: _formatDate(now),
      userId: userId,
      date: DateTime(now.year, now.month, now.day),
      checkInTime: now,
      checkInLocation: location,
      status: AttendanceStatus.checkedIn,
    );

    await _saveRecord(record);
    state = record;
  }

  Future<void> checkOut(AttendanceLocation location) async {
    if (state == null) return;

    final now = DateTime.now();
    final record = state!.copyWith(
      checkOutTime: now,
      checkOutLocation: location,
      status: AttendanceStatus.checkedOut,
    );

    await _saveRecord(record);
    state = record;
  }

  Future<void> _saveRecord(AttendanceRecord record) async {
    final box = Hive.box<String>(_attendanceBox);
    await box.put(record.id, const JsonEncoder().convert(record.toJson()));
  }

  String _formatDate(DateTime date) => '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
}
```

Add imports at top:
```dart
import 'dart:convert';
import 'package:hive_flutter/hive_flutter.dart';
```

Open attendance box in HiveService.init():
Add to the `Hive.openBox` list:
```dart
Hive.openBox<String>(_attendanceBox),
```

**Step 3: Commit**

```bash
git add lib/features/attendance/ lib/shared/providers/app_providers.dart
git commit -m "feat(attendance): add attendance model and providers with GPS tracking"
```

---

## Slice 4: Attendance - UI Page

**Duration:** ~1.5 hours
**Deliverable:** Attendance page with check-in/out, today's summary, and history

### Task 4.1: Create Attendance Page

**Files:**
- Create: `lib/features/attendance/presentation/pages/attendance_page.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/utils/haptic_utils.dart';
import '../../../../shared/providers/app_providers.dart';
import '../../data/models/attendance_record.dart';

class AttendancePage extends ConsumerStatefulWidget {
  const AttendancePage({super.key});

  @override
  ConsumerState<AttendancePage> createState() => _AttendancePageState();
}

class _AttendancePageState extends ConsumerState<AttendancePage> {
  bool _isLoading = false;

  @override
  Widget build(BuildContext context) {
    final todayRecord = ref.watch(todayAttendanceProvider);
    final isCheckedIn = ref.watch(isCheckedInProvider);
    final historyAsync = ref.watch(attendanceHistoryProvider);
    final stats = ref.watch(attendanceStatsProvider);

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => context.go('/home'),
        ),
        title: const Text('Attendance'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Check In/Out Button
            _buildActionButton(isCheckedIn, todayRecord),
            const SizedBox(height: 24),

            // Today's Summary
            _buildTodayCard(todayRecord),
            const SizedBox(height: 24),

            // Monthly Stats
            _buildStatsCard(stats),
            const SizedBox(height: 24),

            // History
            const Text(
              'Recent Activity',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            historyAsync.when(
              data: (records) => records.isEmpty
                  ? _buildEmptyState()
                  : Column(
                      children: records.take(7).map((r) => _buildHistoryItem(r)).toList(),
                    ),
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, __) => const Text('Failed to load history'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActionButton(bool isCheckedIn, AttendanceRecord? today) {
    final color = isCheckedIn ? const Color(0xFFF59E0B) : const Color(0xFF22C55E);
    final icon = isCheckedIn ? LucideIcons.logOut : LucideIcons.logIn;
    final label = isCheckedIn ? 'Check Out' : 'Check In';
    final time = isCheckedIn ? today?.checkInTime : null;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Column(
        children: [
          if (time != null) ...[
            Text(
              'Checked in at ${_formatTime(time)}',
              style: TextStyle(color: Colors.grey[600]),
            ),
            const SizedBox(height: 12),
          ],
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _isLoading ? null : () => _handleCheck(isCheckedIn),
              icon: _isLoading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Icon(icon),
              label: Text(label, style: const TextStyle(fontSize: 18)),
              style: ElevatedButton.styleFrom(
                backgroundColor: color,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTodayCard(AttendanceRecord? today) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.grey[50],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey[200]!),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Today', style: TextStyle(fontWeight: FontWeight.w600)),
              _buildStatusBadge(today?.status ?? AttendanceStatus.absent),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _buildTimeItem(
                  'Check In',
                  today?.checkInTime != null ? _formatTime(today!.checkInTime!) : '--:--',
                  LucideIcons.logIn,
                ),
              ),
              Expanded(
                child: _buildTimeItem(
                  'Check Out',
                  today?.checkOutTime != null ? _formatTime(today!.checkOutTime!) : '--:--',
                  LucideIcons.logOut,
                ),
              ),
              Expanded(
                child: _buildTimeItem(
                  'Hours',
                  today?.formattedHours ?? '--',
                  LucideIcons.clock,
                ),
              ),
            ],
          ),
          if (today?.checkInLocation != null) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Icon(LucideIcons.mapPin, size: 14, color: Colors.grey[500]),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    today?.checkInLocation?.address ?? 'Location captured',
                    style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildTimeItem(String label, String value, IconData icon) {
    return Column(
      children: [
        Icon(icon, size: 20, color: Colors.grey[500]),
        const SizedBox(height: 4),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
        Text(label, style: TextStyle(fontSize: 11, color: Colors.grey[600])),
      ],
    );
  }

  Widget _buildStatusBadge(AttendanceStatus status) {
    Color color;
    String text;

    switch (status) {
      case AttendanceStatus.checkedIn:
        color = const Color(0xFF3B82F6);
        text = 'Active';
        break;
      case AttendanceStatus.checkedOut:
        color = const Color(0xFF22C55E);
        text = 'Complete';
        break;
      case AttendanceStatus.incomplete:
        color = const Color(0xFFF59E0B);
        text = 'Incomplete';
        break;
      case AttendanceStatus.absent:
        color = Colors.grey;
        text = 'Not Started';
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        text,
        style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w500),
      ),
    );
  }

  Widget _buildStatsCard(Map<String, dynamic> stats) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF3B82F6).withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildStatItem('${stats['daysWorked']}', 'Days Worked'),
          Container(width: 1, height: 40, color: Colors.grey[300]),
          _buildStatItem('${stats['totalHours']}h', 'Total Hours'),
          Container(width: 1, height: 40, color: Colors.grey[300]),
          _buildStatItem('${stats['averageHours']}h', 'Avg/Day'),
        ],
      ),
    );
  }

  Widget _buildStatItem(String value, String label) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Color(0xFF3B82F6)),
        ),
        Text(label, style: TextStyle(fontSize: 11, color: Colors.grey[600])),
      ],
    );
  }

  Widget _buildHistoryItem(AttendanceRecord record) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey[50],
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey[200]!),
      ),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: _getStatusColor(record.status),
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _formatDate(record.date),
                  style: const TextStyle(fontWeight: FontWeight.w500),
                ),
                Text(
                  '${record.checkInTime != null ? _formatTime(record.checkInTime!) : '--:--'} - ${record.checkOutTime != null ? _formatTime(record.checkOutTime!) : '--:--'}',
                  style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                ),
              ],
            ),
          ),
          Text(
            record.formattedHours,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Container(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          Icon(LucideIcons.calendar, size: 48, color: Colors.grey[400]),
          const SizedBox(height: 12),
          Text('No attendance records yet', style: TextStyle(color: Colors.grey[600])),
        ],
      ),
    );
  }

  Color _getStatusColor(AttendanceStatus status) {
    switch (status) {
      case AttendanceStatus.checkedOut:
        return const Color(0xFF22C55E);
      case AttendanceStatus.checkedIn:
        return const Color(0xFF3B82F6);
      case AttendanceStatus.incomplete:
        return const Color(0xFFF59E0B);
      case AttendanceStatus.absent:
        return Colors.grey;
    }
  }

  Future<void> _handleCheck(bool isCheckingOut) async {
    HapticUtils.mediumImpact();
    setState(() => _isLoading = true);

    try {
      final locationAsync = ref.read(currentLocationProvider);

      await locationAsync.when(
        data: (location) async {
          final attendanceLocation = AttendanceLocation(
            latitude: location?.latitude ?? 0,
            longitude: location?.longitude ?? 0,
            address: location?.address,
            timestamp: DateTime.now(),
          );

          final notifier = ref.read(todayAttendanceProvider.notifier);
          if (isCheckingOut) {
            await notifier.checkOut(attendanceLocation);
          } else {
            await notifier.checkIn(attendanceLocation);
          }
        },
        loading: () async {
          // Use default location if GPS unavailable
          final attendanceLocation = AttendanceLocation(
            latitude: 0,
            longitude: 0,
            timestamp: DateTime.now(),
          );

          final notifier = ref.read(todayAttendanceProvider.notifier);
          if (isCheckingOut) {
            await notifier.checkOut(attendanceLocation);
          } else {
            await notifier.checkIn(attendanceLocation);
          }
        },
        error: (_, __) async {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Could not get location. Please enable GPS.')),
            );
          }
        },
      );
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  String _formatTime(DateTime time) {
    final hour = time.hour > 12 ? time.hour - 12 : time.hour;
    final ampm = time.hour >= 12 ? 'PM' : 'AM';
    return '${hour == 0 ? 12 : hour}:${time.minute.toString().padLeft(2, '0')} $ampm';
  }

  String _formatDate(DateTime date) {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${days[date.weekday - 1]}, ${months[date.month - 1]} ${date.day}';
  }
}
```

**Step 2: Add route and navigation**

Add import to app_router.dart:
```dart
import '../../features/attendance/presentation/pages/attendance_page.dart';
```

Add route:
```dart
// Attendance route
GoRoute(
  path: '/attendance',
  builder: (context, state) => const AttendancePage(),
),
```

Add navigation case to home_page.dart:
```dart
case 'attendance':
  context.push('/attendance');
  break;
```

**Step 3: Commit**

```bash
git add lib/features/attendance/ lib/core/router/app_router.dart lib/features/home/presentation/pages/home_page.dart
git commit -m "feat(attendance): add attendance page with GPS check-in/out"
```

---

## Slice 5: My Profile - Data Model & Provider

**Duration:** ~30 minutes
**Deliverable:** User profile model and providers

### Task 5.1: Create User Profile Model

**Files:**
- Create: `lib/features/profile/data/models/user_profile.dart`

```dart
/// User profile model
class UserProfile {
  final String id;
  final String employeeId;
  final String firstName;
  final String lastName;
  final String email;
  final String phone;
  final String role;
  final String? profilePhotoUrl;
  final DateTime createdAt;
  final DateTime? updatedAt;

  UserProfile({
    required this.id,
    required this.employeeId,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.phone,
    required this.role,
    this.profilePhotoUrl,
    required this.createdAt,
    this.updatedAt,
  });

  String get fullName => '$firstName $lastName'.trim();

  String get initials {
    if (firstName.isEmpty && lastName.isEmpty) return '?';
    final first = firstName.isNotEmpty ? firstName[0] : '';
    final last = lastName.isNotEmpty ? lastName[0] : '';
    return '$first$last'.toUpperCase();
  }

  UserProfile copyWith({
    String? id,
    String? employeeId,
    String? firstName,
    String? lastName,
    String? email,
    String? phone,
    String? role,
    String? profilePhotoUrl,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return UserProfile(
      id: id ?? this.id,
      employeeId: employeeId ?? this.employeeId,
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      email: email ?? this.email,
      phone: phone ?? this.phone,
      role: role ?? this.role,
      profilePhotoUrl: profilePhotoUrl ?? this.profilePhotoUrl,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'employeeId': employeeId,
    'firstName': firstName,
    'lastName': lastName,
    'email': email,
    'phone': phone,
    'role': role,
    'profilePhotoUrl': profilePhotoUrl,
    'createdAt': createdAt.toIso8601String(),
    'updatedAt': updatedAt?.toIso8601String(),
  };

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      id: json['id'] ?? '',
      employeeId: json['employeeId'] ?? '',
      firstName: json['firstName'] ?? '',
      lastName: json['lastName'] ?? '',
      email: json['email'] ?? '',
      phone: json['phone'] ?? '',
      role: json['role'] ?? 'Field Agent',
      profilePhotoUrl: json['profilePhotoUrl'],
      createdAt: json['createdAt'] != null
          ? DateTime.parse(json['createdAt'])
          : DateTime.now(),
      updatedAt: json['updatedAt'] != null
          ? DateTime.parse(json['updatedAt'])
          : null,
    );
  }

  // Mock profile for development
  static UserProfile mock() {
    return UserProfile(
      id: 'user-1',
      employeeId: 'EMP-2024-001',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      email: 'juan.delacruz@company.com',
      phone: '+63 912 345 6789',
      role: 'Field Agent - Caravan',
      createdAt: DateTime(2024, 1, 15),
    );
  }
}
```

### Task 5.2: Add Profile Providers

**Files:**
- Modify: `lib/shared/providers/app_providers.dart`

Add import:
```dart
import '../../features/profile/data/models/user_profile.dart';
```

Add providers:
```dart
// ==================== Profile Providers ====================

/// Current user profile
final userProfileProvider = StateNotifierProvider<UserProfileNotifier, UserProfile?>((ref) {
  return UserProfileNotifier();
});

/// Is profile loading
final isProfileLoadingProvider = Provider<bool>((ref) {
  return ref.watch(userProfileProvider) == null;
});

/// Profile Notifier
class UserProfileNotifier extends StateNotifier<UserProfile?> {
  UserProfileNotifier() : super(null) {
    _loadProfile();
  }

  void _loadProfile() {
    // TODO: Load from Hive or API
    // For now, use mock data
    state = UserProfile.mock();
  }

  Future<void> updateProfile(UserProfile profile) async {
    // TODO: Save to Hive and sync to API
    state = profile.copyWith(updatedAt: DateTime.now());
  }

  Future<void> logout() async {
    state = null;
  }
}
```

**Step 3: Commit**

```bash
git add lib/features/profile/ lib/shared/providers/app_providers.dart
git commit -m "feat(profile): add user profile model and providers"
```

---

## Slice 6: My Profile - UI Page

**Duration:** ~1 hour
**Deliverable:** Profile page with editable form and logout

### Task 6.1: Create Profile Page

**Files:**
- Create: `lib/features/profile/presentation/pages/profile_page.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/utils/haptic_utils.dart';
import '../../../../shared/providers/app_providers.dart';
import '../../data/models/user_profile.dart';

class ProfilePage extends ConsumerStatefulWidget {
  const ProfilePage({super.key});

  @override
  ConsumerState<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends ConsumerState<ProfilePage> {
  final _formKey = GlobalKey<FormState>();
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();

  bool _isEditing = false;
  bool _isLoading = false;

  @override
  void dispose() {
    _firstNameController.dispose();
    _lastNameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  void _populateControllers(UserProfile profile) {
    _firstNameController.text = profile.firstName;
    _lastNameController.text = profile.lastName;
    _emailController.text = profile.email;
    _phoneController.text = profile.phone;
  }

  void _startEditing() {
    HapticUtils.lightImpact();
    final profile = ref.read(userProfileProvider);
    if (profile != null) {
      _populateControllers(profile);
    }
    setState(() => _isEditing = true);
  }

  void _cancelEditing() {
    HapticUtils.lightImpact();
    setState(() => _isEditing = false);
  }

  Future<void> _saveProfile() async {
    if (!_formKey.currentState!.validate()) return;

    HapticUtils.success();
    setState(() => _isLoading = true);

    try {
      final currentProfile = ref.read(userProfileProvider);
      if (currentProfile == null) return;

      final updatedProfile = currentProfile.copyWith(
        firstName: _firstNameController.text.trim(),
        lastName: _lastNameController.text.trim(),
        email: _emailController.text.trim(),
        phone: _phoneController.text.trim(),
      );

      await ref.read(userProfileProvider.notifier).updateProfile(updatedProfile);

      // Update current user name provider
      ref.read(currentUserNameProvider.notifier).state = updatedProfile.fullName;

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Profile updated successfully'),
            backgroundColor: Color(0xFF22C55E),
          ),
        );
      }

      setState(() => _isEditing = false);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _logout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Logout'),
        content: const Text('Are you sure you want to logout?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFFEF4444)),
            child: const Text('Logout'),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      HapticUtils.mediumImpact();
      await ref.read(userProfileProvider.notifier).logout();
      ref.read(isAuthenticatedProvider.notifier).state = false;
      ref.read(currentUserNameProvider.notifier).state = null;
      if (mounted) context.go('/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(userProfileProvider);

    if (profile == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => context.go('/home'),
        ),
        title: const Text('My Profile'),
        actions: [
          if (!_isEditing)
            IconButton(
              icon: const Icon(LucideIcons.settings),
              onPressed: () => context.push('/settings'),
            ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            // Profile Avatar
            _buildAvatar(profile),
            const SizedBox(height: 8),
            Text(
              profile.fullName,
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
            ),
            Text(
              profile.role,
              style: TextStyle(color: Colors.grey[600]),
            ),
            const SizedBox(height: 32),

            // Profile Form
            if (_isEditing) _buildEditForm(profile) else _buildViewCard(profile),
            const SizedBox(height: 24),

            // Actions
            if (_isEditing) _buildEditActions() else _buildViewActions(),
          ],
        ),
      ),
    );
  }

  Widget _buildAvatar(UserProfile profile) {
    return Container(
      width: 100,
      height: 100,
      decoration: BoxDecoration(
        color: const Color(0xFF3B82F6),
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF3B82F6).withOpacity(0.3),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Center(
        child: Text(
          profile.initials,
          style: const TextStyle(
            fontSize: 36,
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
      ),
    );
  }

  Widget _buildViewCard(UserProfile profile) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.grey[50],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey[200]!),
      ),
      child: Column(
        children: [
          _buildViewField('Employee ID', profile.employeeId, LucideIcons.badge),
          _buildDivider(),
          _buildViewField('First Name', profile.firstName, LucideIcons.user),
          _buildDivider(),
          _buildViewField('Last Name', profile.lastName, LucideIcons.user),
          _buildDivider(),
          _buildViewField('Email', profile.email, LucideIcons.mail),
          _buildDivider(),
          _buildViewField('Phone', profile.phone, LucideIcons.phone),
        ],
      ),
    );
  }

  Widget _buildViewField(String label, String value, IconData icon) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Icon(icon, size: 20, color: Colors.grey[500]),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                Text(value, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDivider() {
    return Divider(height: 1, indent: 48, color: Colors.grey[200]);
  }

  Widget _buildEditForm(UserProfile profile) {
    return Form(
      key: _formKey,
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.grey[50],
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey[200]!),
        ),
        child: Column(
          children: [
            // Employee ID (read-only)
            _buildReadOnlyField('Employee ID', profile.employeeId),
            const SizedBox(height: 16),

            // First Name
            TextFormField(
              controller: _firstNameController,
              decoration: InputDecoration(
                labelText: 'First Name',
                prefixIcon: const Icon(LucideIcons.user),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
              ),
              validator: (value) {
                if (value == null || value.trim().isEmpty) return 'Required';
                return null;
              },
            ),
            const SizedBox(height: 16),

            // Last Name
            TextFormField(
              controller: _lastNameController,
              decoration: InputDecoration(
                labelText: 'Last Name',
                prefixIcon: const Icon(LucideIcons.user),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
              ),
              validator: (value) {
                if (value == null || value.trim().isEmpty) return 'Required';
                return null;
              },
            ),
            const SizedBox(height: 16),

            // Email
            TextFormField(
              controller: _emailController,
              keyboardType: TextInputType.emailAddress,
              decoration: InputDecoration(
                labelText: 'Email',
                prefixIcon: const Icon(LucideIcons.mail),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
              ),
              validator: (value) {
                if (value == null || value.trim().isEmpty) return 'Required';
                if (!value.contains('@')) return 'Invalid email';
                return null;
              },
            ),
            const SizedBox(height: 16),

            // Phone
            TextFormField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(
                labelText: 'Phone',
                prefixIcon: const Icon(LucideIcons.phone),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildReadOnlyField(String label, String value) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey[100],
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(LucideIcons.badge, size: 20, color: Colors.grey[500]),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                Text(value, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500)),
              ],
            ),
          ),
          Icon(LucideIcons.lock, size: 16, color: Colors.grey[400]),
        ],
      ),
    );
  }

  Widget _buildViewActions() {
    return Column(
      children: [
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: _startEditing,
            icon: const Icon(LucideIcons.edit2),
            label: const Text('Edit Profile'),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF3B82F6),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: () => context.push('/settings'),
            icon: const Icon(LucideIcons.settings),
            label: const Text('App Settings'),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
          ),
        ),
        const SizedBox(height: 12),
        TextButton.icon(
          onPressed: _logout,
          icon: const Icon(LucideIcons.logOut, color: Color(0xFFEF4444)),
          label: const Text('Logout', style: TextStyle(color: Color(0xFFEF4444))),
        ),
      ],
    );
  }

  Widget _buildEditActions() {
    return Column(
      children: [
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _isLoading ? null : _saveProfile,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF22C55E),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: _isLoading
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Text('Save Changes'),
          ),
        ),
        const SizedBox(height: 12),
        TextButton(
          onPressed: _cancelEditing,
          child: const Text('Cancel'),
        ),
      ],
    );
  }
}
```

**Step 2: Add route and navigation**

Add import to app_router.dart:
```dart
import '../../features/profile/presentation/pages/profile_page.dart';
```

Add route:
```dart
// Profile route
GoRoute(
  path: '/profile',
  builder: (context, state) => const ProfilePage(),
),
```

Add navigation case to home_page.dart:
```dart
case 'profile':
  context.push('/profile');
  break;
```

**Step 3: Commit**

```bash
git add lib/features/profile/ lib/core/router/app_router.dart lib/features/home/presentation/pages/home_page.dart
git commit -m "feat(profile): add profile page with edit form and logout"
```

---

## Summary

| Slice | Feature | Description | Duration |
|-------|---------|-------------|----------|
| 1 | Loan Calculator | Data model & calculation service | 30 min |
| 2 | Loan Calculator | UI page with amortization table | 1 hour |
| 3 | Attendance | Data model & providers with GPS | 45 min |
| 4 | Attendance | UI page with check-in/out | 1.5 hours |
| 5 | My Profile | Data model & providers | 30 min |
| 6 | My Profile | UI page with edit form | 1 hour |
| **Total** | | | **~5.5 hours** |

## Files Created

```
lib/features/
├── calculator/
│   ├── data/
│   │   ├── models/
│   │   │   └── loan_calculation.dart
│   │   └── services/
│   │       └── loan_calculator_service.dart
│   └── presentation/pages/
│       └── loan_calculator_page.dart
│
├── attendance/
│   ├── data/models/
│   │   └── attendance_record.dart
│   └── presentation/pages/
│       └── attendance_page.dart
│
└── profile/
    ├── data/models/
    │   └── user_profile.dart
    └── presentation/pages/
        └── profile_page.dart
```

## Files Modified

- `lib/shared/providers/app_providers.dart` - Added attendance and profile providers
- `lib/core/router/app_router.dart` - Added routes for /calculator, /attendance, /profile
- `lib/features/home/presentation/pages/home_page.dart` - Enabled navigation for all three features
