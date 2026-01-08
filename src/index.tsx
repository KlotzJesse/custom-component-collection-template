import React, { useMemo } from "react";

import "./output.css";

import { type FC } from "react";

import { Retool } from "@tryretool/custom-component-support";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import "./output.css";

type WorkerData = {
  Mitarbeiter: string;

  startDate?: string;

  endDate?: string;

  [key: string]: string | number | undefined;
};

const columnHelper = createColumnHelper<WorkerData>();

export const PivotTable: FC = () => {
  const [data] = Retool.useStateArray({
    name: "data",

    initialValue: [],
  });

  // Transform and filter data

  const transformedData = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    return (
      (data as any[])

        // eslint-disable-next-line @typescript-eslint/no-explicit-any

        .filter((row: any) => row && row.absence_type !== "Frei")

        // eslint-disable-next-line @typescript-eslint/no-explicit-any

        .map((row: any) => {
          const monthMap: Record<string, string> = {
            "2025-01": "Januar",

            "2025-02": "Februar",

            "2025-03": "März",

            "2025-04": "April",

            "2025-05": "Mai",

            "2025-06": "Juni",

            "2025-07": "Juli",

            "2025-08": "August",

            "2025-09": "September",

            "2025-10": "Oktober",

            "2025-11": "November",

            "2025-12": "Dezember",
          };

          const absenceTypeMap: Record<string, string> = {
            Urlaub: "Urlaub",

            Krank: "Krank",

            Fortbildung: "Fortbildung",

            Sonderurlaub: "Sonderurlaub",

            Homeoffice: "Homeoffice",
          };

          return {
            Mitarbeiter: row.worker_name,

            Monat: monthMap[row.month] || row.month,

            Art: absenceTypeMap[row.absence_type] || row.absence_type,

            Tage: row.total_days,

            startDate: row.start_date,

            endDate: row.end_date,
          };
        })
    );
  }, [data]);

  // Create pivot data

  const pivotData = useMemo(() => {
    if (!transformedData.length) return [];

    const monthOrder = [
      "Januar",
      "Februar",
      "März",
      "April",
      "Mai",
      "Juni",
      "Juli",
      "August",
      "September",
      "Oktober",
      "November",
      "Dezember",
    ];

    const uniqueMonths = [...new Set(transformedData.map((d) => d.Monat))]

      .sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));

    const targetTypes = ["Urlaub", "Krank"];

    const uniqueWorkers = [
      ...new Set(transformedData.map((d) => d.Mitarbeiter)),
    ].sort();

    // Create pivot rows

    const pivotRows: WorkerData[] = uniqueWorkers.map((worker) => {
      const workerData = transformedData.filter(
        (d) => d.Mitarbeiter === worker,
      );

      const row: WorkerData = {
        Mitarbeiter: worker,

        startDate: workerData[0]?.startDate,

        endDate: workerData[0]?.endDate,
      };

      // Initialize all month/type columns to 0

      uniqueMonths.forEach((month) => {
        targetTypes.forEach((type) => {
          const columnKey = `${month}_${type}`;

          row[columnKey] = 0;
        });
      });

      // Aggregate data for this worker

      workerData.forEach((d) => {
        if (targetTypes.includes(d.Art)) {
          const columnKey = `${d.Monat}_${d.Art}`;

          row[columnKey] = (row[columnKey] as number) + d.Tage;
        }
      });

      // Calculate totals by type

      let totalUrlaub = 0;

      let totalKrank = 0;

      uniqueMonths.forEach((month) => {
        const urlaubKey = `${month}_Urlaub`;

        const krankKey = `${month}_Krank`;

        totalUrlaub += row[urlaubKey] as number;

        totalKrank += row[krankKey] as number;
      });

      row["Total_Urlaub"] = totalUrlaub;

      row["Total_Krank"] = totalKrank;

      row["Total"] = totalUrlaub + totalKrank;

      return row;
    });

    // Add totals row

    const totalsRow: WorkerData = { Mitarbeiter: "Summe" };

    uniqueMonths.forEach((month) => {
      targetTypes.forEach((type) => {
        const columnKey = `${month}_${type}`;

        const total = pivotRows.reduce(
          (sum, row) => sum + (row[columnKey] as number),

          0,
        );

        totalsRow[columnKey] = total;
      });
    });

    const totalUrlaubSum = pivotRows.reduce(
      (sum, row) => sum + (row["Total_Urlaub"] as number),

      0,
    );

    const totalKrankSum = pivotRows.reduce(
      (sum, row) => sum + (row["Total_Krank"] as number),

      0,
    );

    totalsRow["Total_Urlaub"] = totalUrlaubSum;

    totalsRow["Total_Krank"] = totalKrankSum;

    totalsRow["Total"] = totalUrlaubSum + totalKrankSum;

    return [...pivotRows, totalsRow];
  }, [transformedData]);

  // Helper function to check if month is within worker's employment period

  const isMonthInEmploymentPeriod = (
    month: string,

    startDate?: string,

    endDate?: string,
  ) => {
    if (!startDate && !endDate) return { isInPeriod: true, isDisabled: false };

    const monthMap: Record<string, string> = {
      Januar: "2025-01",

      Februar: "2025-02",

      März: "2025-03",

      April: "2025-04",

      Mai: "2025-05",

      Juni: "2025-06",

      Juli: "2025-07",

      August: "2025-08",

      September: "2025-09",

      Oktober: "2025-10",

      November: "2025-11",

      Dezember: "2025-12",
    };

    const monthCode = monthMap[month];

    if (!monthCode) return { isInPeriod: true, isDisabled: false };

    const monthDate = new Date(monthCode + "-01");

    const start = startDate ? new Date(startDate) : new Date("1900-01-01");

    const end = endDate ? new Date(endDate) : new Date("2100-12-31");

    // Check if month is before start date or after end date

    const isBeforeStart = startDate && monthDate < start;

    const isAfterEnd = endDate && monthDate > end;

    const isDisabled = isBeforeStart || isAfterEnd;

    const isInPeriod = monthDate >= start && monthDate <= end;

    return { isInPeriod, isDisabled, isBeforeStart, isAfterEnd };
  };

  // Create columns with grouped headers using columnHelper

  const columns = useMemo(() => {
    if (!pivotData.length) return [];

    const monthOrder = [
      "Januar",
      "Februar",
      "März",
      "April",
      "Mai",
      "Juni",
      "Juli",
      "August",
      "September",
      "Oktober",
      "November",
      "Dezember",
    ];

    const uniqueMonths = [...new Set(transformedData.map((d) => d.Monat))]

      .sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));

    const targetTypes = ["Urlaub", "Krank"];

    const cols = [
      // Name column

      columnHelper.accessor("Mitarbeiter", {
        id: "name",

        header: "Name",

        cell: (info) => {
          const isTotal = info.row.original.Mitarbeiter === "Summe";

          return (
            <div
              className={`text-left font-medium text-gray-900 pl-3 pr-2 h-full flex items-center whitespace-nowrap ${!isTotal ? "group-hover:bg-[#009def] group-hover:text-white" : ""}`}
            >
              {info.getValue()}
            </div>
          );
        },
      }),

      // Month groups

      ...uniqueMonths.map((month) =>
        columnHelper.group({
          id: `${month}_group`,

          header: () => (
            <span className="font-semibold text-xs">{month.slice(0, 3)}</span>
          ),

          columns: targetTypes.map((type) =>
            columnHelper.accessor(`${month}_${type}`, {
              id: `${month}_${type}`,

              header: type,

              cell: (info) => {
                const value = info.getValue() as number;

                const isTotal = info.row.original.Mitarbeiter === "Summe";

                const workerStartDate = info.row.original.startDate;

                const workerEndDate = info.row.original.endDate;

                const employmentStatus = !isTotal
                  ? isMonthInEmploymentPeriod(
                      month,

                      workerStartDate,

                      workerEndDate,
                    )
                  : { isInPeriod: true, isDisabled: false };

                let cellClass =
                  "text-center text-xs h-full flex items-center justify-center w-full ";

                if (!isTotal) {
                  cellClass +=
                    "group-hover:bg-[#009def] group-hover:text-white ";
                }

                if (isTotal) {
                  cellClass += "bg-blue-100 font-semibold";
                } else if (employmentStatus.isDisabled) {
                  cellClass += "bg-red-200 text-gray-500";
                } else if (type === "Urlaub") {
                  cellClass += "bg-gray-100";
                } else {
                  cellClass += "bg-white";
                }

                return (
                  <div className={cellClass}>
                    {employmentStatus.isDisabled && !isTotal
                      ? ""
                      : value === 0
                        ? ""
                        : value.toString()}
                  </div>
                );
              },
            }),
          ),
        }),
      ),

      // Totals group

      columnHelper.group({
        id: "totals_group",

        header: () => <span className="font-semibold text-xs">Total</span>,

        columns: [
          columnHelper.accessor("Total_Urlaub", {
            header: "U",

            cell: (info) => {
              const value = info.getValue() as number;

              const isTotal = info.row.original.Mitarbeiter === "Summe";

              const cellClass = isTotal
                ? "text-center text-xs h-full flex items-center justify-center bg-blue-100 font-semibold w-full"
                : "text-center text-xs h-full flex items-center justify-center bg-gray-100 w-full group-hover:bg-[#009def] group-hover:text-white";

              return (
                <div className={cellClass}>
                  {value === 0 ? "" : value.toString()}
                </div>
              );
            },
          }),

          columnHelper.accessor("Total_Krank", {
            header: "K",

            cell: (info) => {
              const value = info.getValue() as number;

              const isTotal = info.row.original.Mitarbeiter === "Summe";

              const cellClass = isTotal
                ? "text-center text-xs h-full flex items-center justify-center bg-blue-100 font-semibold w-full"
                : "text-center text-xs h-full flex items-center justify-center bg-white w-full group-hover:bg-[#009def] group-hover:text-white";

              return (
                <div className={cellClass}>
                  {value === 0 ? "" : value.toString()}
                </div>
              );
            },
          }),

          columnHelper.accessor("Total", {
            header: "Σ",

            cell: (info) => {
              const value = info.getValue() as number;

              const isTotal = info.row.original.Mitarbeiter === "Summe";

              const cellClass = isTotal
                ? "text-center text-xs h-full flex items-center justify-center bg-blue-100 font-bold w-full"
                : "text-center text-xs h-full flex items-center justify-center bg-green-100 font-semibold w-full group-hover:bg-[#009def] group-hover:text-white";

              return <div className={cellClass}>{value.toString()}</div>;
            },
          }),
        ],
      }),
    ];

    return cols;
  }, [pivotData, transformedData, isMonthInEmploymentPeriod]);

  const table = useReactTable({
    data: pivotData,

    columns,

    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="w-full h-full overflow-auto p-2 min-h-0">
      <table className="w-full border-collapse border border-gray-200 text-xs font-sans shadow-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  colSpan={header.colSpan}
                  className="border border-gray-200 bg-gray-50 px-1 py-2 text-center font-semibold text-gray-700 text-xs h-8"
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,

                        header.getContext(),
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const isTotal = row.original.Mitarbeiter === "Summe";

            return (
              <tr
                key={row.id}
                className={`h-8 group hover:bg-[#009def] hover:text-white ${isTotal ? "bg-blue-50" : ""}`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="border border-gray-200 p-0 h-8">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
