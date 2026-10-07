import { ShiftInfo } from '../types';

export const EXAM_SHIFTS: ShiftInfo[] = [
  { id: 'shift-01', shiftNumber: 1, date: '2026-09-23', displayDate: '23 सितम्बर 2026', shiftTime: 'Morning', timeLabel: 'प्रातः 09:00 - 12:00' },
  { id: 'shift-02', shiftNumber: 2, date: '2026-09-23', displayDate: '23 सितम्बर 2026', shiftTime: 'Afternoon', timeLabel: 'दोपहर 02:30 - 05:30' },
  { id: 'shift-03', shiftNumber: 3, date: '2026-09-24', displayDate: '24 सितम्बर 2026', shiftTime: 'Morning', timeLabel: 'प्रातः 09:00 - 12:00' },
  { id: 'shift-04', shiftNumber: 4, date: '2026-09-24', displayDate: '24 सितम्बर 2026', shiftTime: 'Afternoon', timeLabel: 'दोपहर 02:30 - 05:30' },
  // 25 Sept is holiday
  { id: 'shift-05', shiftNumber: 5, date: '2026-09-26', displayDate: '26 सितम्बर 2026', shiftTime: 'Morning', timeLabel: 'प्रातः 09:00 - 12:00' },
  { id: 'shift-06', shiftNumber: 6, date: '2026-09-26', displayDate: '26 सितम्बर 2026', shiftTime: 'Afternoon', timeLabel: 'दोपहर 02:30 - 05:30' },
  { id: 'shift-07', shiftNumber: 7, date: '2026-09-27', displayDate: '27 सितम्बर 2026', shiftTime: 'Morning', timeLabel: 'प्रातः 09:00 - 12:00' },
  { id: 'shift-08', shiftNumber: 8, date: '2026-09-27', displayDate: '27 सितम्बर 2026', shiftTime: 'Afternoon', timeLabel: 'दोपहर 02:30 - 05:30' },
  { id: 'shift-09', shiftNumber: 9, date: '2026-09-28', displayDate: '28 सितम्बर 2026', shiftTime: 'Morning', timeLabel: 'प्रातः 09:00 - 12:00' },
  { id: 'shift-10', shiftNumber: 10, date: '2026-09-28', displayDate: '28 सितम्बर 2026', shiftTime: 'Afternoon', timeLabel: 'दोपहर 02:30 - 05:30' },
  { id: 'shift-11', shiftNumber: 11, date: '2026-09-29', displayDate: '29 सितम्बर 2026', shiftTime: 'Morning', timeLabel: 'प्रातः 09:00 - 12:00' },
  { id: 'shift-12', shiftNumber: 12, date: '2026-09-29', displayDate: '29 सितम्बर 2026', shiftTime: 'Afternoon', timeLabel: 'दोपहर 02:30 - 05:30' },
  { id: 'shift-13', shiftNumber: 13, date: '2026-09-30', displayDate: '30 सितम्बर 2026', shiftTime: 'Morning', timeLabel: 'प्रातः 09:00 - 12:00' },
  { id: 'shift-14', shiftNumber: 14, date: '2026-09-30', displayDate: '30 सितम्बर 2026', shiftTime: 'Afternoon', timeLabel: 'दोपहर 02:30 - 05:30' },
  { id: 'shift-15', shiftNumber: 15, date: '2026-10-01', displayDate: '01 अक्टूबर 2026', shiftTime: 'Morning', timeLabel: 'प्रातः 09:00 - 12:00' },
  { id: 'shift-16', shiftNumber: 16, date: '2026-10-01', displayDate: '01 अक्टूबर 2026', shiftTime: 'Afternoon', timeLabel: 'दोपहर 02:30 - 05:30' },
  // 02 Oct is Gandhi Jayanti holiday
  { id: 'shift-17', shiftNumber: 17, date: '2026-10-03', displayDate: '03 अक्टूबर 2026', shiftTime: 'Morning', timeLabel: 'प्रातः 09:00 - 12:00' },
  { id: 'shift-18', shiftNumber: 18, date: '2026-10-03', displayDate: '03 अक्टूबर 2026', shiftTime: 'Afternoon', timeLabel: 'दोपहर 02:30 - 05:30' },
  { id: 'shift-19', shiftNumber: 19, date: '2026-10-04', displayDate: '04 अक्टूबर 2026', shiftTime: 'Morning', timeLabel: 'प्रातः 09:00 - 12:00' },
  { id: 'shift-20', shiftNumber: 20, date: '2026-10-04', displayDate: '04 अक्टूबर 2026', shiftTime: 'Afternoon', timeLabel: 'दोपहर 02:30 - 05:30' },
  { id: 'shift-21', shiftNumber: 21, date: '2026-10-05', displayDate: '05 अक्टूबर 2026', shiftTime: 'Morning', timeLabel: 'प्रातः 09:00 - 12:00' },
  { id: 'shift-22', shiftNumber: 22, date: '2026-10-05', displayDate: '05 अक्टूबर 2026', shiftTime: 'Afternoon', timeLabel: 'दोपहर 02:30 - 05:30' },
];

export const getShiftByNumber = (shiftNumber: number): ShiftInfo | undefined => {
  return EXAM_SHIFTS.find((s) => s.shiftNumber === shiftNumber);
};

export const getShiftById = (id: string): ShiftInfo | undefined => {
  return EXAM_SHIFTS.find((s) => s.id === id);
};
