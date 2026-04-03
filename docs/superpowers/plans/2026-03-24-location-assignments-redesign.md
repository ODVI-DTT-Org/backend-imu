# Location Assignments Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-step. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Location Assignments page with a two-pane master-detail layout and hierarchical bulk selection for assigning municipalities to caravans.

**Architecture:** Two-pane split view with CaravanSelector (left) and MunicipalityManager (right). MunicipalityManager contains BulkMunicipalitySelector (accordion with checkboxes) and AssignedMunicipalitiesList (current assignments). Uses existing PSGC and Caravan stores, no new API endpoints needed.

**Tech Stack:** Vue 3 Composition API, Pinia, Tailwind CSS, TypeScript, existing stores (useCaravansStore, usePsgcStore)

---

## File Structure

**New Components:**
- `src/components/locations/CaravanSelector.vue` - Left pane: compact avatar grid (64px, 2 columns)
- `src/components/locations/MunicipalityManager.vue` - Right pane: header + bulk selector + assigned list
- `src/components/locations/BulkMunicipalitySelector.vue` - Accordion: Region → Province → Municipality checkboxes
- `src/components/locations/AssignedMunicipalitiesList.vue` - List of assigned with remove buttons

**Modified:**
- `src/views/locations/LocationAssignmentsView.vue` - Replace with two-pane layout

**Referenced (no changes):**
- `src/stores/caravans.ts` - Existing caravans store
- `src/stores/psgc.ts` - Existing PSGC store
- `src/composables/usePermission.ts` - Permission checking
- `src/composables/useToast.ts` - Toast notifications
- `src/lib/api-client.ts` - API client

---

## Task 1: Create Shared Utility Functions

**Files:**
- Create: `src/components/locations/utils.ts`
- Test: No test (simple utility)

- [ ] **Step 1: Create utility functions file**

Create `src/components/locations/utils.ts` with shared utilities:

```typescript
/**
 * Get initials from name (reused from CaravansListView.vue)
 * @param name - Full name
 * @returns Two-letter initials
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

/**
 * Get municipality display name
 * @param municipality - PSGC municipality object
 * @returns Formatted display name
 */
export function getMunicipalityDisplayName(municipality: { name: string; province: string }): string {
  return `${municipality.name}, ${municipality.province}`
}

/**
 * Check if a municipality ID matches an assignment
 * @param municipalityId - Format: "province-municipality"
 * @param assignedIds - Set of assigned municipality IDs
 * @returns True if already assigned
 */
export function isAssigned(municipalityId: string, assignedIds: Set<string>): boolean {
  return assignedIds.has(municipalityId)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/locations/utils.ts
git commit -m "feat: add shared utilities for location components

- getInitials: create 2-letter initials from name
- getMunicipalityDisplayName: format municipality name
- isAssigned: check if municipality is already assigned"
```

---

## Task 2: Create CaravanSelector Component

**Files:**
- Create: `src/components/locations/CaravanSelector.vue`
- Referenced: `src/views/caravan/CaravansListView.vue` (getInitials pattern)

**Color Note:** Uses `secondary-500/600` (blue) to match Button.vue primary variant

- [ ] **Step 1: Write CaravanSelector component**

Create `src/components/locations/CaravanSelector.vue`:

```vue
<script setup lang="ts">
/**
 * CaravanSelector Component
 * Left pane: compact avatar grid for selecting caravans
 */
import { computed, onMounted } from 'vue'
import { useCaravansStore } from '@/stores/caravans'
import { getInitials } from './utils'
import type { Caravan } from '@/lib/types'

interface Props {
  modelValue: string // Selected caravan ID
}

interface Emits {
  (e: 'update:modelValue', value: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const caravansStore = useCaravansStore()

const loading = computed(() => caravansStore.loading)
const caravans = computed(() => caravansStore.caravans)

const selectedId = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

function selectCaravan(caravan: Caravan) {
  selectedId.value = caravan.id
}

// Fetch caravans on mount
onMounted(() => {
  caravansStore.fetchCaravans()
})

// Provide computed for empty state
const hasCaravans = computed(() => caravans.value.length > 0)
</script>

<template>
  <div class="h-full overflow-y-auto p-4">
    <!-- Loading State -->
    <div v-if="loading && caravans.length === 0" class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-secondary-500"></div>
    </div>

    <!-- Empty State -->
    <div v-else-if="!hasCaravans" class="text-center py-12">
      <svg class="mx-auto h-12 w-12 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-neutral-900">No caravans</h3>
      <p class="mt-1 text-xs text-neutral-500">Create a caravan first</p>
    </div>

    <!-- Caravan Grid -->
    <div v-else class="grid grid-cols-2 gap-3">
      <div
        v-for="caravan in caravans"
        :key="caravan.id"
        :class="[
          'flex flex-col items-center p-3 rounded-lg cursor-pointer transition-all',
          'border-2',
          selectedId === caravan.id
            ? 'border-secondary-600 bg-secondary-50'
            : 'border-neutral-200 bg-white hover:bg-neutral-50 hover:border-neutral-300'
        ]"
        @click="selectCaravan(caravan)"
      >
        <!-- Avatar -->
        <div
          :class="[
            'w-16 h-16 rounded-full flex items-center justify-center mb-2',
            caravan.status === 'active'
              ? 'bg-secondary-100 text-secondary-700'
              : 'bg-neutral-100 text-neutral-500'
          ]"
        >
          <span class="text-lg font-semibold">{{ getInitials(caravan.name) }}</span>
        </div>

        <!-- Name -->
        <p class="text-xs font-medium text-neutral-900 text-center truncate w-full">
          {{ caravan.name }}
        </p>

        <!-- Email (truncated) -->
        <p class="text-xs text-neutral-500 text-center truncate w-full">
          {{ caravan.email }}
        </p>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/locations/CaravanSelector.vue
git commit -m "feat: add CaravanSelector component

- Compact avatar grid (2 columns, 64px avatars)
- Reuses getInitials utility from CaravansListView
- Loading and empty states
- Selected state with ring border
- Uses secondary-500/600 color (blue) to match Button.vue"
```

---

## Task 3: Create AssignedMunicipalitiesList Component

**Files:**
- Create: `src/components/locations/AssignedMunicipalitiesList.vue`
- Modify: `src/lib/types.ts` (ensure LocationAssignment exists)

- [ ] **Step 1: Ensure LocationAssignment type exists in types.ts**

Check if `LocationAssignment` exists in `src/lib/types.ts`. If not, add it:

```typescript
// Add to src/lib/types.ts
export interface LocationAssignment {
  id: string
  municipality_id: string
  municipality_name: string
  municipality_code: string
  region_name: string
  region_code: string
  assigned_at: string
  assigned_by: string
}
```

- [ ] **Step 2: Write AssignedMunicipalitiesList component**

Create `src/components/locations/AssignedMunicipalitiesList.vue`:

```vue
<script setup lang="ts">
/**
 * AssignedMunicipalitiesList Component
 * Right pane: list of currently assigned municipalities with remove buttons
 */
import { computed } from 'vue'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { api } from '@/lib/api-client'
import type { LocationAssignment } from '@/lib/types'

interface Props {
  caravanId: string
  assignments: LocationAssignment[]
  loading: boolean
}

interface Emits {
  (e: 'removed'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const { can } = usePermission()
const toast = useToast()

const hasAssignments = computed(() => props.assignments.length > 0)
const canEdit = computed(() => can('edit_agents'))

async function removeAssignment(assignment: LocationAssignment) {
  if (!canEdit.value) return

  if (!confirm(`Remove "${assignment.municipality_name}" from this caravan?`)) {
    return
  }

  try {
    await api.delete(`/caravans/${props.caravanId}/municipalities/${assignment.municipality_id}`)
    toast.success('Municipality removed successfully')
    emit('removed')
  } catch (error) {
    console.error('Failed to remove assignment:', error)
    toast.error('Failed to remove municipality')
  }
}

const displayCount = computed(() => props.assignments.length)
</script>

<template>
  <div class="bg-white rounded-xl border border-neutral-200 p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-sm font-semibold text-neutral-900">
        Assigned Municipalities
        <span v-if="hasAssignments" class="text-neutral-500 font-normal">
          ({{ displayCount }})
        </span>
      </h2>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-8">
      <div class="flex items-center gap-2">
        <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-secondary-500"></div>
        <span class="text-sm text-neutral-500">Loading assignments...</span>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="!hasAssignments" class="text-center py-8 text-neutral-500">
      <svg class="mx-auto h-12 w-12 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <p class="mt-2 text-sm">No municipalities assigned yet</p>
      <p class="text-xs text-neutral-400">Use Bulk Assign to add locations</p>
    </div>

    <!-- Assignment List -->
    <div v-else class="space-y-2">
      <div
        v-for="assignment in assignments"
        :key="assignment.id"
        class="flex items-center justify-between p-3 bg-neutral-50 rounded-lg group"
      >
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-neutral-900 truncate">
            {{ assignment.municipality_name }}
          </p>
          <p class="text-xs text-neutral-500 truncate">
            {{ assignment.region_name }}
          </p>
        </div>

        <button
          v-if="canEdit"
          @click="removeAssignment(assignment)"
          class="ml-3 p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
          title="Remove assignment"
        >
          <!-- Heroicons x-mark -->
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <!-- View-only indicator -->
        <div v-else class="ml-3 p-2 text-neutral-300" title="View-only mode">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/locations/AssignedMunicipalitiesList.vue src/lib/types.ts
git commit -m "feat: add AssignedMunicipalitiesList component and LocationAssignment type

- List of assigned municipalities with remove buttons
- Loading and empty states
- Permission-based view-only mode
- Toast notifications
- Centralized LocationAssignment type in types.ts"
```

---

## Task 4: Create BulkMunicipalitySelector Component

**Files:**
- Create: `src/components/locations/BulkMunicipalitySelector.vue`
- Referenced: `src/stores/psgc.ts`

- [ ] **Step 1: Write BulkMunicipalitySelector component**

Create `src/components/locations/BulkMunicipalitySelector.vue`:

```vue
<script setup lang="ts">
/**
 * BulkMunicipalitySelector Component
 * Accordion with hierarchical checkboxes: Region → Province → Municipality
 */
import { ref, computed, onMounted, watch } from 'vue'
import { usePsgcStore } from '@/stores/psgc'
import { isAssigned } from './utils'

interface PsgcMunicipality {
  id: string
  region: string
  province: string
  name: string
  kind: string
  isCity: boolean
}

interface Props {
  caravanId: string
  assignedIds: Set<string>
}

interface Emits {
  (e: 'assign', municipalityIds: string[]): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const psgcStore = usePsgcStore()

// Expanded state
const expandedRegions = ref<Set<string>>(new Set())
const expandedProvinces = ref<Set<string>>(new Set())

// Checked state (only NEW selections, not already assigned)
const checkedMunicipalities = ref<Set<string>>(new Set())

// Data
const regions = computed(() => psgcStore.regions)
const provinces = computed(() => psgcStore.provinces)
const municipalities = computed(() => psgcStore.municipalities)
const loading = computed(() => psgcStore.loading)

// Group provinces by region
const provincesByRegion = computed(() => {
  const grouped = new Map<string, typeof provinces.value>()
  for (const province of provinces.value) {
    if (!grouped.has(province.region)) {
      grouped.set(province.region, [])
    }
    grouped.get(province.region)!.push(province)
  }
  return grouped
})

// Group municipalities by province
const municipalitiesByProvince = computed(() => {
  const grouped = new Map<string, PsgcMunicipality[]>()
  for (const municipality of municipalities.value) {
    if (!grouped.has(municipality.province)) {
      grouped.set(municipality.province, [])
    }
    grouped.get(municipality.province)!.push(municipality)
  }
  return grouped
})

// Toggle region expand
function toggleRegion(regionId: string) {
  if (expandedRegions.value.has(regionId)) {
    expandedRegions.value.delete(regionId)
  } else {
    expandedRegions.value.add(regionId)
    // Load provinces for this region if not loaded
    // Note: fetchProvinces expects region NAME, not ID
    const region = regions.value.find(r => r.id === regionId)
    if (region && (provinces.value.length === 0 || !provinces.value.some(p => p.region === region.name))) {
      psgcStore.fetchProvinces(region.name)
      psgcStore.fetchMunicipalities({ region: region.name })
    }
  }
}

// Toggle province expand
function toggleProvince(provinceName: string) {
  if (expandedProvinces.value.has(provinceName)) {
    expandedProvinces.value.delete(provinceName)
  } else {
    expandedProvinces.value.add(provinceName)
  }
}

// Get municipalities for a province
function getMunicipalitiesForProvince(provinceName: string): PsgcMunicipality[] {
  return municipalitiesByProvince.value.get(provinceName) || []
}

// Check if province has all municipalities checked
function isProvinceChecked(provinceName: string): boolean {
  const muns = getMunicipalitiesForProvince(provinceName)
  if (muns.length === 0) return false

  const assignableMuns = muns.filter(m => !isAssigned(m.id, props.assignedIds))
  if (assignableMuns.length === 0) return false

  return assignableMuns.every(m => checkedMunicipalities.value.has(m.id))
}

// Check if province is indeterminate (some checked)
function isProvinceIndeterminate(provinceName: string): boolean {
  const muns = getMunicipalitiesForProvince(provinceName)
  if (muns.length === 0) return false

  const assignableMuns = muns.filter(m => !isAssigned(m.id, props.assignedIds))
  if (assignableMuns.length === 0) return false

  const checkedCount = assignableMuns.filter(m => checkedMunicipalities.value.has(m.id)).length
  return checkedCount > 0 && checkedCount < assignableMuns.length
}

// Check if region has all provinces checked
function isRegionChecked(regionId: string): boolean {
  const region = regions.value.find(r => r.id === regionId)
  if (!region) return false

  const regionProvinces = provincesByRegion.value.get(region.name) || []
  if (regionProvinces.length === 0) return false

  return regionProvinces.every(p => isProvinceChecked(p.name))
}

// Check if region is indeterminate
function isRegionIndeterminate(regionId: string): boolean {
  const region = regions.value.find(r => r.id === regionId)
  if (!region) return false

  const regionProvinces = provincesByRegion.value.get(region.name) || []
  if (regionProvinces.length === 0) return false

  const anyChecked = regionProvinces.some(p => isProvinceChecked(p.name) || isProvinceIndeterminate(p.name))
  const allChecked = regionProvinces.every(p => isProvinceChecked(p.name))

  return anyChecked && !allChecked
}

// Handle municipality checkbox
function toggleMunicipality(municipalityId: string) {
  if (checkedMunicipalities.value.has(municipalityId)) {
    checkedMunicipalities.value.delete(municipalityId)
  } else {
    checkedMunicipalities.value.add(municipalityId)
  }
}

// Handle province checkbox
function toggleProvinceCheck(provinceName: string) {
  const muns = getMunicipalitiesForProvince(provinceName)
  const assignableMuns = muns.filter(m => !isAssigned(m.id, props.assignedIds))

  if (isProvinceChecked(provinceName)) {
    // Uncheck all
    assignableMuns.forEach(m => checkedMunicipalities.value.delete(m.id))
  } else {
    // Check all
    assignableMuns.forEach(m => checkedMunicipalities.value.add(m.id))
  }
}

// Handle region checkbox
function toggleRegionCheck(regionId: string) {
  const region = regions.value.find(r => r.id === regionId)
  if (!region) return

  const regionProvinces = provincesByRegion.value.get(region.name) || []

  if (isRegionChecked(regionId)) {
    // Uncheck all provinces
    regionProvinces.forEach(p => {
      const muns = getMunicipalitiesForProvince(p.name)
      muns.forEach(m => checkedMunicipalities.value.delete(m.id))
    })
  } else {
    // Check all provinces
    regionProvinces.forEach(p => {
      const muns = getMunicipalitiesForProvince(p.name)
      muns.forEach(m => {
        if (!isAssigned(m.id, props.assignedIds)) {
          checkedMunicipalities.value.add(m.id)
        }
      })
    })
  }
}

// Count of newly selected municipalities (excludes already assigned)
const selectedCount = computed(() => checkedMunicipalities.value.size)

// Assign selected municipalities
async function assignSelected() {
  if (selectedCount.value === 0) return

  const ids = Array.from(checkedMunicipalities.value)
  emit('assign', ids)

  // Clear selections after emit
  checkedMunicipalities.value.clear()
}

// Fetch regions on mount
onMounted(() => {
  psgcStore.fetchRegions()
})

// Reset checked municipalities when assigned IDs change
watch(() => props.assignedIds, () => {
  checkedMunicipalities.value.clear()
})
</script>

<template>
  <div class="bg-white rounded-xl border border-neutral-200 p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-sm font-semibold text-neutral-900">Bulk Assign</h2>
      <span class="text-xs text-neutral-500">{{ selectedCount }} selected</span>
    </div>

    <!-- Loading State -->
    <div v-if="loading && regions.length === 0" class="flex items-center justify-center py-8">
      <div class="flex items-center gap-2">
        <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-secondary-500"></div>
        <span class="text-sm text-neutral-500">Loading regions...</span>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="regions.length === 0" class="text-center py-8 text-neutral-500">
      <p class="text-sm">No regions available</p>
    </div>

    <!-- Region List -->
    <div v-else class="space-y-2">
      <div
        v-for="region in regions"
        :key="region.id"
        class="border border-neutral-200 rounded-lg overflow-hidden"
      >
        <!-- Region Header -->
        <div
          class="flex items-center gap-3 p-3 bg-neutral-50 hover:bg-neutral-100 cursor-pointer"
          @click="toggleRegion(region.id)"
        >
          <!-- Expand/Collapse Icon -->
          <svg
            :class="['w-4 h-4 text-neutral-500 transition-transform', expandedRegions.has(region.id) && 'rotate-90']"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>

          <!-- Region Checkbox -->
          <input
            type="checkbox"
            :checked="isRegionChecked(region.id)"
            :indeterminate="isRegionIndeterminate(region.id)"
            @click.stop="toggleRegionCheck(region.id)"
            class="w-4 h-4 text-secondary-600 border-neutral-300 rounded focus:ring-secondary-500 cursor-pointer"
          />

          <span class="text-sm font-medium text-neutral-900">{{ region.name }}</span>
        </div>

        <!-- Provinces (expanded) -->
        <div v-if="expandedRegions.has(region.id)" class="border-t border-neutral-200 bg-white">
          <div
            v-for="province in provincesByRegion.get(region.id)"
            :key="province.name"
            class="border-b border-neutral-100 last:border-b-0"
          >
            <!-- Province Header -->
            <div
              class="flex items-center gap-3 p-3 pl-10 hover:bg-neutral-50 cursor-pointer"
              @click="toggleProvince(province.name)"
            >
              <!-- Expand/Collapse Icon -->
              <svg
                :class="['w-4 h-4 text-neutral-500 transition-transform', expandedProvinces.has(province.name) && 'rotate-90']"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>

              <!-- Province Checkbox -->
              <input
                type="checkbox"
                :checked="isProvinceChecked(province.name)"
                :indeterminate="isProvinceIndeterminate(province.name)"
                @click.stop="toggleProvinceCheck(province.name)"
                class="w-4 h-4 text-secondary-600 border-neutral-300 rounded focus:ring-secondary-500 cursor-pointer"
              />

              <span class="text-sm text-neutral-700">{{ province.name }}</span>
            </div>

            <!-- Municipalities (expanded) -->
            <div v-if="expandedProvinces.has(province.name)" class="border-t border-neutral-100 bg-neutral-50/50">
              <div
                v-for="municipality in getMunicipalitiesForProvince(province.name)"
                :key="municipality.id"
                class="flex items-center gap-3 p-2 pl-16 hover:bg-neutral-50"
              >
                <!-- Municipality Checkbox -->
                <input
                  type="checkbox"
                  :model-value="checkedMunicipalities.has(municipality.id)"
                  :disabled="isAssigned(municipality.id, assignedIds)"
                  @change="toggleMunicipality(municipality.id)"
                  class="w-4 h-4 text-secondary-600 border-neutral-300 rounded focus:ring-secondary-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                />

                <span
                  :class="[
                    'text-sm',
                    isAssigned(municipality.id, assignedIds)
                      ? 'text-neutral-400 line-through'
                      : 'text-neutral-600'
                  ]"
                >
                  {{ municipality.name }}
                  <span v-if="isAssigned(municipality.id, assignedIds)" class="text-xs">(assigned)</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Assign Button -->
    <div class="mt-4 pt-4 border-t border-neutral-200">
      <button
        @click="assignSelected"
        :disabled="selectedCount === 0"
        class="w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors disabled:bg-neutral-100 disabled:text-neutral-400 disabled:cursor-not-allowed bg-secondary-600 text-white hover:bg-secondary-700"
      >
        Assign Selected ({{ selectedCount }})
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/locations/BulkMunicipalitySelector.vue
git commit -m "feat: add BulkMunicipalitySelector component

- Hierarchical accordion: Region → Province → Municipality
- Checkboxes with indeterminate state for partial selections
- Already-assigned municipalities shown disabled
- Assign Selected button with count
- Lazy loading of provinces/municipalities on expand"
```

---

## Task 5: Create MunicipalityManager Component

**Files:**
- Create: `src/components/locations/MunicipalityManager.vue`

- [ ] **Step 1: Write MunicipalityManager component**

Create `src/components/locations/MunicipalityManager.vue`:

```vue
<script setup lang="ts">
/**
 * MunicipalityManager Component
 * Right pane: coordinates bulk selector and assigned list for a caravan
 * Supports view-only mode for users without edit_agents permission
 */
import { ref, computed, watch, onMounted } from 'vue'
import { useCaravansStore } from '@/stores/caravans'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import { api } from '@/lib/api-client'
import BulkMunicipalitySelector from './BulkMunicipalitySelector.vue'
import AssignedMunicipalitiesList from './AssignedMunicipalitiesList.vue'
import type { Caravan } from '@/lib/types'
import type { LocationAssignment } from '@/lib/types'

interface Props {
  caravanId: string
}

interface Emits {
  (e: 'close'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const caravansStore = useCaravansStore()
const { can } = usePermission()
const toast = useToast()

const assignments = ref<LocationAssignment[]>([])
const loading = ref(false)
const assigning = ref(false)

const caravan = computed<Caravan | undefined>(() =>
  caravansStore.caravans.find(c => c.id === props.caravanId)
)

// View-only mode: users without edit_agents permission
const canEdit = computed(() => can('edit_agents'))

// Set of assigned municipality IDs for quick lookup
const assignedIds = computed(() => {
  return new Set(assignments.value.map(a => a.municipality_id))
})

async function fetchAssignments() {
  if (!props.caravanId) return

  loading.value = true
  try {
    const response = await api.get<{ items: LocationAssignment[] }>(
      `/caravans/${props.caravanId}/municipalities`
    )
    assignments.value = response.items || []
  } catch (error) {
    console.error('Failed to fetch assignments:', error)
    toast.error('Failed to fetch location assignments')
  } finally {
    loading.value = false
  }
}

async function handleAssign(municipalityIds: string[]) {
  if (!props.caravanId || municipalityIds.length === 0) return

  assigning.value = true
  try {
    const response = await api.post<{ message: string; assigned_count: number }>(
      `/caravans/${props.caravanId}/municipalities`,
      { municipality_ids: municipalityIds }
    )

    toast.success(
      `${response.assigned_count} municipality${response.assigned_count > 1 ? 's' : ''} assigned successfully`
    )

    // Refresh assignments
    await fetchAssignments()
  } catch (error) {
    console.error('Failed to assign municipalities:', error)
    toast.error('Failed to assign municipalities')
  } finally {
    assigning.value = false
  }
}

function handleRemoved() {
  // Refresh assignments when one is removed
  fetchAssignments()
}

// Fetch assignments when caravan changes
watch(() => props.caravanId, () => {
  fetchAssignments()
}, { immediate: true })

onMounted(() => {
  fetchAssignments()
})
</script>

<template>
  <div class="h-full overflow-y-auto">
    <!-- Header -->
    <div v-if="caravan" class="bg-white rounded-xl border border-neutral-200 p-6 mb-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-neutral-900">{{ caravan.name }}</h2>
          <p class="text-sm text-neutral-500">{{ caravan.email }}</p>
        </div>
        <!-- View-only indicator -->
        <div v-if="!canEdit" class="flex items-center gap-2 px-3 py-1 bg-neutral-100 rounded-full">
          <svg class="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span class="text-xs text-neutral-500">View-only</span>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-else class="bg-white rounded-xl border border-neutral-200 p-12 text-center mb-6">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-secondary-500 mx-auto"></div>
      <p class="mt-2 text-sm text-neutral-500">Loading caravan details...</p>
    </div>

    <!-- Bulk Selector (only shown if can edit) -->
    <BulkMunicipalitySelector
      v-if="caravan && canEdit"
      :caravan-id="caravanId"
      :assigned-ids="assignedIds"
      @assign="handleAssign"
    />

    <!-- View-only message (shown instead of bulk selector) -->
    <div v-else-if="caravan && !canEdit" class="bg-neutral-50 border border-neutral-200 rounded-xl p-6 mb-6">
      <div class="flex items-center gap-3 text-neutral-600">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <p class="text-sm">You don't have permission to modify location assignments.</p>
      </div>
    </div>

    <!-- Spacer -->
    <div class="h-6"></div>

    <!-- Assigned List -->
    <AssignedMunicipalitiesList
      v-if="caravan"
      :caravan-id="caravanId"
      :assignments="assignments"
      :loading="loading"
      @removed="handleRemoved"
    />
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/locations/MunicipalityManager.vue
git commit -m "feat: add MunicipalityManager component

- Coordinates bulk selector and assigned list
- Header with caravan name and email
- API integration for assign/remove operations
- Refreshes assignments after each operation"
```

---

## Task 6: Create New LocationAssignmentsView (Two-Pane Layout)

**Files:**
- Replace: `src/views/locations/LocationAssignmentsView.vue`

- [ ] **Step 1: Backup old file and create new LocationAssignmentsView**

Replace `src/views/locations/LocationAssignmentsView.vue`:

```vue
<script setup lang="ts">
/**
 * Location Assignments View
 * Two-pane master-detail layout for managing municipality assignments
 */
import { ref } from 'vue'
import AdminLayout from '@/layouts/AdminLayout.vue'
import CaravanSelector from '@/components/locations/CaravanSelector.vue'
import MunicipalityManager from '@/components/locations/MunicipalityManager.vue'

const selectedCaravanId = ref('')
</script>

<template>
  <AdminLayout>
    <template #title>
      <h1 class="text-lg font-semibold text-neutral-900">Location Assignments</h1>
    </template>

    <!-- Two-Pane Layout -->
    <div class="flex flex-col lg:flex-row gap-6 h-[calc(100vh-180px)]">
      <!-- Left Pane: Caravan Selector (30%) -->
      <div class="w-full lg:w-1/3 bg-white rounded-xl border border-neutral-200">
        <div class="p-4 border-b border-neutral-200">
          <h2 class="text-sm font-semibold text-neutral-900">Select Caravan</h2>
        </div>
        <CaravanSelector v-model="selectedCaravanId" />
      </div>

      <!-- Right Pane: Municipality Manager (70%) -->
      <div class="w-full lg:w-2/3">
        <MunicipalityManager
          v-if="selectedCaravanId"
          :caravan-id="selectedCaravanId"
        />

        <!-- Empty State (no caravan selected) -->
        <div
          v-else
          class="bg-white rounded-xl border border-neutral-200 p-12 text-center h-full flex items-center justify-center"
        >
          <div>
            <svg class="mx-auto h-16 w-16 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h3 class="mt-4 text-lg font-medium text-neutral-900">Select a Caravan</h3>
            <p class="mt-2 text-sm text-neutral-500">
              Choose a caravan from the left panel to manage their location assignments
            </p>
          </div>
        </div>
      </div>
    </div>
  </AdminLayout>
</template>
```

- [ ] **Step 2: Test the view in browser**

Run: `pnpm dev` (from imu-web-vue directory)
Navigate to: `http://localhost:4002/locations`
Expected: Two-pane layout with caravan selector on left, empty state on right

- [ ] **Step 3: Commit**

```bash
git add src/views/locations/LocationAssignmentsView.vue
git commit -m "feat: redesign LocationAssignmentsView with two-pane layout

- Left pane: CaravanSelector with compact avatar grid
- Right pane: MunicipalityManager with bulk selector and assigned list
- Responsive: stacked on mobile, side-by-side on desktop
- Empty state when no caravan selected"
```

---

## Task 7: Update TypeScript Types

**Files:**
- Modify: `src/lib/types.ts`
- Backup: `src/views/locations/LocationAssignmentsView.vue` (old version)

- [ ] **Step 1: Backup old LocationAssignmentsView and ensure LocationAssignment type exists**

```bash
# Backup old implementation (in case we need to reference it)
cp src/views/locations/LocationAssignmentsView.vue src/views/locations/LocationAssignmentsView.vue.backup
```

- [ ] **Step 2: Add LocationAssignment type to types.ts (if not exists)**

Check if `LocationAssignment` interface exists in `src/lib/types.ts`. If not, add it:

```typescript
// Add to src/lib/types.ts
export interface LocationAssignment {
  id: string
  municipality_id: string
  municipality_name: string
  municipality_code: string
  region_name: string
  region_code: string
  assigned_at: string
  assigned_by: string
}
```

- [ ] **Step 3: Remove duplicate LocationAssignment from backup file**

Note: The old `LocationAssignmentsView.vue.backup` has `LocationAssignment` defined inline (lines 14-23). We're removing this file in Task 6, so the duplicate will be removed then. No action needed here.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add LocationAssignment type to types.ts

- Centralized type definition for location assignments
- Removes duplicate inline definition from old view"
```

---

## Task 8: Final Testing and Verification

**Files:**
- Test all components

- [ ] **Step 1: Test caravan selection**

1. Navigate to `/locations`
2. Click on a caravan in the left pane
3. Verify right pane shows caravan details
4. Verify "Assigned Municipalities" list loads

- [ ] **Step 2: Test bulk assignment**

1. Click "Bulk Assign" section
2. Expand a region
3. Expand a province
4. Check province checkbox (all municipalities should check)
5. Click "Assign Selected" button
6. Verify success toast
7. Verify assigned list updates

- [ ] **Step 3: Test individual removal**

1. Click [×] button on an assigned municipality
2. Confirm removal dialog
3. Verify success toast
4. Verify item removed from list

- [ ] **Step 4: Test permission-based view-only mode**

1. Log in as user without `edit_agents` permission
2. Navigate to `/locations`
3. Verify remove buttons are hidden
4. Verify lock icons appear
5. Verify bulk selector is hidden or disabled

- [ ] **Step 5: Test responsive layout**

1. Resize browser to mobile width (< 768px)
2. Verify panes stack vertically
3. Verify caravan selector is full width
4. Verify municipality manager is full width below

- [ ] **Step 6: Test edge cases**

1. Select caravan with no assignments → verify empty state
2. Select caravan with 100+ assignments → verify all load
3. Test with slow network → verify loading states
4. Test API error → verify error toast

- [ ] **Step 7: Commit final changes (if any)**

```bash
git add .
git commit -m "fix: final adjustments from testing"
```

---

## Task 9: Update Documentation

**Files:**
- Update: `CLAUDE.md` (if needed)

- [ ] **Step 1: Check if CLAUDE.md needs updates**

Review `CLAUDE.md` for any references to Location Assignments that need updating.

- [ ] **Step 2: Commit documentation updates**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for location assignments redesign"
```

---

## Completion Checklist

- [ ] All components created (CaravanSelector, MunicipalityManager, BulkMunicipalitySelector, AssignedMunicipalitiesList)
- [ ] LocationAssignmentsView redesigned with two-pane layout
- [ ] TypeScript types added/updated
- [ ] All features tested (selection, bulk assign, remove, permissions, responsive)
- [ ] Documentation updated
- [ ] No console errors
- [ ] All tests pass (if tests exist)

---

## Notes for Developers

**Key Patterns:**
- Use `getInitials()` from utils for avatar generation
- Use `usePermission()` composable for permission checks
- Use `useToast()` composable for notifications
- Municipality IDs are in format `"province-municipality"`
- Already-assigned municipalities should be shown disabled in bulk selector

**Troubleshooting:**
- If PSGC data doesn't load: check `usePsgcStore` and backend `/api/psgc/*` endpoints
- If assignments don't load: check backend `/api/caravans/:id/municipalities` endpoint
- If checkboxes don't work: verify `Set` operations and reactivity
- If responsive layout breaks: check Tailwind breakpoints (`lg:flex-row`)

**Performance:**
- PSGC data is cached in store after first fetch
- Provinces/municipalities load lazily on accordion expand
- Consider virtual scrolling if assigned list exceeds 100 items
