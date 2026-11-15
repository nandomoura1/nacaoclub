-- Ausências: Home office (desconta passagem e alimentação nos Benefícios da escala 5x2).
ALTER TYPE "LeaveType" ADD VALUE IF NOT EXISTS 'HOME_OFFICE';
