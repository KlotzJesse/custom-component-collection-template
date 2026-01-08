// =================================================================
// Main transformer logic
// =================================================================

const currentWorkers = {{query52.data}};
const historicalWorkers = {{query51.data}};
const result = [];

const holidays = Array.from({{bavarianHolidays.value}} || []);

if (currentWorkers && currentWorkers.worker_name && historicalWorkers) {
  currentWorkers.worker_name.forEach((name, index) => {
    const currentAbsences = currentWorkers.absences_by_day[index];

    // Step 1: Analyze current absences to learn the "Permitted Weekdays".
    const permittedWeekdays = new Set();
    const absencesToReschedule = new Set();
    let latestAbsenceDate = null;

    // Learn permitted weekdays from current absences (not 'Frei' type)
    if (currentAbsences) {
      for (const day in currentAbsences) {
        const absencesArray = currentAbsences[day]; // Now an array

        // Iterate through each absence for this day
        absencesArray.forEach(absence => {
          // Learn permitted weekdays from all absences except 'Frei' type
          if (absence.type && absence.type !== 'Frei') {
            permittedWeekdays.add(moment(absence.date).isoWeekday());
          }

          // We only consider 'Urlaub' type for rescheduling, excluding codes with '/'
          if (absence.counts_as_absence &&
              absence.type === 'Urlaub' &&
              (!absence.code || !absence.code.includes('/'))) {
            absencesToReschedule.add(absence.date);
            if (!latestAbsenceDate || moment(absence.date).isAfter(latestAbsenceDate)) {
              latestAbsenceDate = absence.date;
            }
          }
        });
      }
    }

    // Learn permitted weekdays from historical data (not 'Frei' type)
    const historicalWorkerData = historicalWorkers.find(w => w.worker_name === name);
    if (historicalWorkerData && historicalWorkerData.absences_by_day) {
      for (const day in historicalWorkerData.absences_by_day) {
        const historicalAbsencesArray = historicalWorkerData.absences_by_day[day];

        // Handle if historical data is an array
        if (Array.isArray(historicalAbsencesArray)) {
          historicalAbsencesArray.forEach(absence => {
            if (absence.type && absence.type !== 'Frei') {
              permittedWeekdays.add(moment(absence.date).isoWeekday());
            }
          });
        } else {
          // Handle backward compatibility if it's still a single object
          if (historicalAbsencesArray.type && historicalAbsencesArray.type !== 'Frei') {
            permittedWeekdays.add(moment(historicalAbsencesArray.date).isoWeekday());
          }
        }
      }
    }

    const totalDaysToReschedule = absencesToReschedule.size;

    if (totalDaysToReschedule > 0) {
      // Helper function to simulate what dates would have been used for historical absences
      // This recursively calculates which dates in the past were "consumed" by each absence
      const simulateHistoricalBlockedDates = (allAbsenceDates, existingBlockedDates, permittedWeekdays) => {
        const historicallyConsumedDates = new Set();

        // Sort all absence dates chronologically (oldest first)
        const sortedAbsences = Array.from(allAbsenceDates)
          .map(d => moment(d))
          .sort((a, b) => a.diff(b));

        // For each absence, simulate finding available dates going backwards
        sortedAbsences.forEach(absenceDate => {
          // Start from the day before this absence
          let searchDate = moment(absenceDate).subtract(1, 'day');
          let foundCount = 0;
          const maxIterations = 1000; // Safety limit
          let iterations = 0;

          // Find one available date for this absence (simulating the original calculation)
          while (foundCount < 1 && iterations < maxIterations) {
            const dateStr = searchDate.format('YYYY-MM-DD');
            const dayOfWeek = searchDate.isoWeekday();

            // Check if this date would have been available at the time
            const isWeekday = dayOfWeek < 6;
            const isPermitted = permittedWeekdays.has(dayOfWeek);
            const wasBlocked = existingBlockedDates.has(dateStr);
            const wasAlreadyConsumed = historicallyConsumedDates.has(dateStr);

            if (isWeekday && isPermitted && !wasBlocked && !wasAlreadyConsumed) {
              // This date would have been used for this absence
              historicallyConsumedDates.add(dateStr);
              foundCount++;
            }

            searchDate.subtract(1, 'day');
            iterations++;
          }
        });

        return historicallyConsumedDates;
      };

      // Step 2: Create the master list of ALL blocked dates from every source.
      // BUG FIX: We now add ALL dates from the source data, regardless of 'counts_as_absence',
      // to ensure holidays like the 15th are always blocked.
      const allBlockedDates = new Set(holidays);

      // Add all historical dates
      if (historicalWorkerData && historicalWorkerData.absences_by_day) {
        for (const day in historicalWorkerData.absences_by_day) {
          const historicalAbsencesArray = historicalWorkerData.absences_by_day[day];

          // Handle if historical data is also an array
          if (Array.isArray(historicalAbsencesArray)) {
            historicalAbsencesArray.forEach(absence => {
              allBlockedDates.add(absence.date);
            });
          } else {
            // Handle backward compatibility if it's still a single object
            allBlockedDates.add(historicalAbsencesArray.date);
          }
        }
      }

      // Add all current dates
      if (currentAbsences) {
        for (const day in currentAbsences) {
          const absencesArray = currentAbsences[day];
          absencesArray.forEach(absence => {
            allBlockedDates.add(absence.date);
          });
        }
      }

      // Step 2b: Collect ALL absence dates (both historical and current) that are before today
      const allPastAbsenceDates = new Set();
      const today = moment();

      // Collect historical absences
      if (historicalWorkerData && historicalWorkerData.absences_by_day) {
        for (const day in historicalWorkerData.absences_by_day) {
          const historicalAbsencesArray = historicalWorkerData.absences_by_day[day];

          if (Array.isArray(historicalAbsencesArray)) {
            historicalAbsencesArray.forEach(absence => {
              if (absence.counts_as_absence && moment(absence.date).isBefore(today)) {
                allPastAbsenceDates.add(absence.date);
              }
            });
          } else {
            if (historicalAbsencesArray.counts_as_absence && moment(historicalAbsencesArray.date).isBefore(today)) {
              allPastAbsenceDates.add(historicalAbsencesArray.date);
            }
          }
        }
      }

      // Collect current absences that are in the past
      if (currentAbsences) {
        for (const day in currentAbsences) {
          const absencesArray = currentAbsences[day];
          absencesArray.forEach(absence => {
            if (absence.counts_as_absence && moment(absence.date).isBefore(today)) {
              allPastAbsenceDates.add(absence.date);
            }
          });
        }
      }

      // Simulate which dates would have been consumed by all historical absences
      const historicallyConsumedDates = simulateHistoricalBlockedDates(
        allPastAbsenceDates,
        allBlockedDates,
        permittedWeekdays
      );

      // Add these historically consumed dates to the blocked list
      historicallyConsumedDates.forEach(date => {
        allBlockedDates.add(date);
      });

      // Step 3: Search backwards day-by-day and collect the first available slots
      // that match one of the permitted weekdays.
      const newCalculatedDates = [];
      let currentDate = moment(latestAbsenceDate);

      while (newCalculatedDates.length < totalDaysToReschedule) {
        currentDate.subtract(1, 'day');

        const dayOfWeek = currentDate.isoWeekday();
        const formattedDate = currentDate.format('YYYY-MM-DD');

        // Check if the day is a permitted weekday AND not blocked (includes historically consumed dates)
        if (dayOfWeek < 6 &&
            permittedWeekdays.has(dayOfWeek) &&
            !allBlockedDates.has(formattedDate)) {
          newCalculatedDates.push(formattedDate);
        }
      }

      result.push({
        workerName: name,
        absenceDates: newCalculatedDates.sort()
      });
    }
  });
}

return result;