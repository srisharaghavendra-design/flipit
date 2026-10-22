// Three differently formatted fictional files for the mapping test.
const XLSX=require('xlsx'),fs=require('fs'),path=require('path');const D=path.join(__dirname,'fixtures');
const ws1=XLSX.utils.aoa_to_sheet([['Full Name','E-mail Address','Organisation','Job Title','Mobile','Country','Attended?'],
 ['Rao, Asha','asha.rao@batiktelecom.example','Batik Telecom','CIO','+91 98450 11111','India','Yes'],['Liam Carter','liam.c@orbitenergy.example','Orbit Energy','CISO','0412 555 019','Australia','No'],
 ['Mei Tan','mei.tan@harbourfoods.example','Harbour Foods','IT Director','+65 8123 4567','Singapore','Y'],['Kenta Ono','kenta.ono@sorafin.example','Sora Finance','CTO','03-5555-0101','Japan','yes']]);
const wb1=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb1,ws1,'Attendees');XLSX.writeFile(wb1,path.join(D,'event_attendees_export.xlsx'));
fs.writeFileSync(path.join(D,'abm_target_list.csv'),'first_name;last_name;work_email;account;designation;geo\nPriya;Menon;priya.menon@zenithpharma.example;Zenith Pharma;VP Infrastructure;IN\nJack;Wilson;jack.w@coralpharma.example;Coral Pharma;Head of Security;AUS\nYuki;Hara;yuki.hara@kumoworks.example;Kumo Works;Network Manager;JP\nNur;Aziz;nur.aziz@lionport.example;Lion Port;CIO;MY\n');
const ws3=XLSX.utils.aoa_to_sheet([['Tech Expo 2026 – Booth badge scans'],['Exported 18/10/2026 by booth app'],[],['Name','Email ID','Company Name','Role','Ph','Location (City, Country)','Scan type'],
 ['Sam Lee','sam.lee@aurorainsurance.example','Aurora Insurance','CTO','+91 99000 22222','Mumbai, India','Booth visit'],['Ana Cruz','','Isla Retail','Procurement Manager','','Manila, Philippines','Booth visit'],
 ['Tom Field','tom.field@outbackair.example','Outback Air','IT Director','+61 2 5550 1234','Sydney, Australia','Demo'],['Tom Field','TOM.FIELD@outbackair.example','Outback Air','IT Director','','Sydney, Australia','Demo']]);
const wb3=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb3,ws3,'Scans');XLSX.writeFile(wb3,path.join(D,'booth_badge_scans.xlsx'));console.log('fixtures written');
