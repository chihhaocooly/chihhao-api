import regions from './taiwan-regions.json';
export const taiwanRegions = regions;
export const memberValidationContext = () => ({
  today: new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()),
  resolveDistrict: (cityCode: string, districtCode: string) => {
    const city = regions.cities.find((item) => item.code === cityCode);
    const district = city?.districts.find((item) => item.code === districtCode);
    return city && district ? { cityName: city.name, districtName: district.name } : null;
  },
});
