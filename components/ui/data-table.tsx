'use client';

/**
 * Data Table — shadcn/ui Data Table guide 的共用實作 (TanStack Table v9)
 * 參考: https://ui.shadcn.com/docs/components/base/data-table
 *
 * 這份元件提供:
 *   - 排序 (rowSortingFeature + createSortedRowModel)
 *   - 分頁 (rowPaginationFeature + createPaginatedRowModel)
 *   - 多選 (rowSelectionFeature) + 已選筆數提示
 *   - 欄位顯示切換 (columnVisibilityFeature)
 *   - 空的話改用 <Empty /> 空狀態
 *
 * 為什麼 features 宣告在 module scope:
 *   TanStack Table v9 是 feature-based 的 —— 未在 features 註冊的行為會被
 *   tree-shake 掉, 所以這個物件必須是靜態的 (不能每次 render 重建)。
 */

import * as React from 'react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type OnChangeFn,
  type ReactTable,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type PaginationState,
  type ColumnVisibilityState,
  type ColumnFiltersState,
  type Updater,
} from '@tanstack/react-table';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Settings2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/shadcn-select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { cn } from '@/lib/utils';

export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});

export type DataTableFeatures = typeof dataTableFeatures;

export interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<DataTableFeatures, TData>[];
  data: TData[];
  /** 空的時候顯示的空狀態 (預設用「沒有資料」) */
  empty?: ReactNode;
  /** 表格 className */
  className?: string;
  /** 是否顯示欄位切換下拉 */
  showColumnToggle?: boolean;
  /** 是否顯示分頁列 */
  showPagination?: boolean;
  /** 每頁筆數預設值 */
  defaultPageSize?: number;
  /** 外部受控的已選 row ids (雙向) */
  selectedRowIds?: string[];
  onSelectedRowIdsChange?: (ids: string[]) => void;
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  empty,
  className,
  showColumnToggle = true,
  showPagination = true,
  defaultPageSize = 10,
  selectedRowIds,
  onSelectedRowIdsChange,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: defaultPageSize,
  });

  // 外部受控選取狀態 → 同步進內部
  useEffect(() => {
    if (!selectedRowIds) return;
    setRowSelection(
      selectedRowIds.reduce<RowSelectionState>((acc, id) => {
        acc[id] = true;
        return acc;
      }, {}),
    );
  }, [selectedRowIds]);

  const handleRowSelectionChange: OnChangeFn<RowSelectionState> = (
    updater: Updater<RowSelectionState>,
  ) => {
    setRowSelection((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      onSelectedRowIdsChange?.(Object.keys(next));
      return next;
    });
  };

  const table = useTable<DataTableFeatures, TData>({
    features: dataTableFeatures,
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: handleRowSelectionChange,
    onPaginationChange: setPagination,
  });

  const rows = table.getRowModel().rows;

  if (data.length === 0) {
    return (
      <>
        {empty ?? (
          <Empty className={className}>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Settings2 className="w-6 h-6" />
              </EmptyMedia>
              <EmptyTitle>沒有資料</EmptyTitle>
              <EmptyDescription>目前沒有符合條件的記錄。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {showColumnToggle && (
        <div className="flex items-center justify-end">
          <DataTableViewOptions table={table} />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <span className="text-sm text-muted-foreground">
                    沒有符合條件的結果
                  </span>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {showPagination && <DataTablePagination table={table} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Pagination                                                                  */
/* -------------------------------------------------------------------------- */

function DataTablePagination<TData extends RowData>({
  table,
}: {
  table: ReactTable<DataTableFeatures, TData>;
}) {
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;
  const filteredCount = table.getFilteredRowModel().rows.length;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
      <div className="flex-1 text-sm text-muted-foreground">
        已選 {selectedCount} / {filteredCount} 筆
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">每頁</p>
          <Select
            value={`${table.state.pagination.pageSize}`}
            onValueChange={(value) => table.setPageSize(Number(value))}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={`${table.state.pagination.pageSize}`} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 25, 30, 40, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-[100px] items-center justify-center text-sm font-medium">
          第 {table.state.pagination.pageIndex + 1} / {table.getPageCount()} 頁
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">第一頁</span>
            <ChevronsLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">上一頁</span>
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">下一頁</span>
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">最後一頁</span>
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Column toggle                                                               */
/* -------------------------------------------------------------------------- */

function DataTableViewOptions<TData extends RowData>({
  table,
}: {
  table: ReactTable<DataTableFeatures, TData>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="ml-auto hidden h-8 lg:flex">
          <Settings2 className="size-4" />
          欄位
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[150px]">
        <DropdownMenuLabel>顯示欄位</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          .filter(
            (column) =>
              typeof column.accessorFn !== 'undefined' && column.getCanHide(),
          )
          .map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              className="capitalize"
              checked={column.getIsVisible()}
              onCheckedChange={(value) => column.toggleVisibility(!!value)}
            >
              {column.id}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* -------------------------------------------------------------------------- */
/*  Selection checkbox column                                                   */
/* -------------------------------------------------------------------------- */

/**
 * 建立一欄「多選」checkbox 欄位。
 * 貼到 columns 的第一欄即可開啟全選 / 單列選取。
 *
 * shadcn 官方寫法: checked 傳 boolean | 'indeterminate',
 * 不用獨立的 indeterminate prop (Radix Checkbox 沒有這個 prop)。
 */
export function createSelectColumn<TData extends RowData>() {
  return {
    id: 'select',
    header: ({ table }: { table: any }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="全選"
      />
    ),
    cell: ({ row }: { row: any }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="選取此列"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  } as unknown as ColumnDef<DataTableFeatures, TData>;
}
