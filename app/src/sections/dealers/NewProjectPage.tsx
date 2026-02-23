import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import AmenitySelector from '@/components/realty/AmenitySelector';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';
import {
  createProject,
  getBuilderMembership,
  listAmenities,
  listCompanies,
  type Amenity,
  type BuilderMembership,
  type Company,
  type Project,
} from '@/lib/realtyApi';
import { uploadImageFile } from '@/lib/mediaUploadApi';
import type { AuthUser } from '@/lib/session';

interface NewProjectPageProps {
  token: string;
  user: AuthUser | null;
  onBack: () => void;
  onProjectCreated: (projectId: number) => void;
}

export default function NewProjectPage({
  token,
  user,
  onBack,
  onProjectCreated,
}: NewProjectPageProps) {
  const [membership, setMembership] = useState<BuilderMembership | null>(null);
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [adminCompanies, setAdminCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [projectName, setProjectName] = useState('');
  const [projectType, setProjectType] = useState<'Apartment' | 'Villa' | 'Plotted' | 'Commercial'>('Apartment');
  const [stateName, setStateName] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [pricePerSqft, setPricePerSqft] = useState('');
  const [configurationsText, setConfigurationsText] = useState('');
  const [totalUnits, setTotalUnits] = useState('');
  const [totalFloors, setTotalFloors] = useState('');
  const [totalArea, setTotalArea] = useState('');
  const [possessionDate, setPossessionDate] = useState('');
  const [status, setStatus] = useState<'Upcoming' | 'Under Construction' | 'Ready to Move'>('Upcoming');
  const [projectImageUrls, setProjectImageUrls] = useState<string[]>([]);
  const [uploadingProjectImages, setUploadingProjectImages] = useState(false);
  const [brochureUrl, setBrochureUrl] = useState('');
  const [highlights, setHighlights] = useState('');
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);

  const amenityNames = useMemo(() => amenities.map((item) => item.name), [amenities]);
  const amenityNameToId = useMemo(() => {
    const map = new Map<string, number>();
    amenities.forEach((amenity) => map.set(amenity.name, amenity.id));
    return map;
  }, [amenities]);

  useEffect(() => {
    let active = true;
    if (!token) {
      setLoading(false);
      return;
    }

    const shouldLoadAdminCompanies = user?.role === 'admin';

    Promise.all([
      getBuilderMembership(token),
      listAmenities(),
      shouldLoadAdminCompanies ? listCompanies({ limit: 100 }) : Promise.resolve([] as Company[]),
    ])
      .then(([memberData, amenityRows, companyRows]) => {
        if (!active) return;
        setMembership(memberData);
        setAmenities(amenityRows);
        setAdminCompanies(
          (companyRows || []).filter(
            (company) => company.companyType === 'builder' || company.companyType === 'dealer'
          )
        );
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load project form');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token, user?.role]);

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      return;
    }
    if (membership?.company?.id) {
      setSelectedCompanyId(String(membership.company.id));
      return;
    }
    if (selectedCompanyId) {
      return;
    }
    const firstCompanyId = adminCompanies[0]?.id;
    if (firstCompanyId) {
      setSelectedCompanyId(String(firstCompanyId));
    }
  }, [adminCompanies, membership?.company?.id, selectedCompanyId, user]);

  const memberCompanyId =
    membership?.company &&
    (membership.company.type === 'builder' || membership.company.type === 'dealer')
      ? membership.company.id
      : 0;
  const adminCompanyId = user?.role === 'admin' ? Number(selectedCompanyId || 0) : 0;
  // Admins can create for any selected company. Non-admin users are restricted to their linked company.
  const targetCompanyId = user?.role === 'admin' ? adminCompanyId : memberCompanyId;
  const canCreateProject = Boolean(token && user && targetCompanyId > 0);

  const handleSubmit = async () => {
    if (!token || !user) return;
    setError('');

    if (!projectName.trim()) {
      setError('Project name is required.');
      return;
    }
    if (!stateName.trim() || !city.trim() || !area.trim() || !fullAddress.trim()) {
      setError('State, city, area, and full address are required.');
      return;
    }
    if (selectedAmenities.length === 0) {
      setError('Please select at least one amenity.');
      return;
    }
    if (!targetCompanyId) {
      setError('Please select a company for this project.');
      return;
    }

    const configurations = configurationsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const amenityIds = selectedAmenities
      .map((name) => amenityNameToId.get(name) || 0)
      .filter((id) => id > 0);

    setSubmitting(true);
    try {
      const project: Project = await createProject(
        {
          companyId: targetCompanyId,
          projectName: projectName.trim(),
          projectType,
          state: stateName.trim(),
          city: city.trim(),
          area: area.trim(),
          fullAddress: fullAddress.trim(),
          landmark: landmark.trim(),
          latitude: latitude ? Number(latitude) : null,
          longitude: longitude ? Number(longitude) : null,
          priceMin: priceMin ? Number(priceMin) : null,
          priceMax: priceMax ? Number(priceMax) : null,
          pricePerSqft: pricePerSqft ? Number(pricePerSqft) : null,
          configurations,
          totalUnits: totalUnits ? Number(totalUnits) : null,
          totalFloors: totalFloors ? Number(totalFloors) : null,
          totalArea: totalArea ? Number(totalArea) : null,
          possessionDate: possessionDate || '',
          status,
          imageUrls: projectImageUrls,
          brochureUrl: brochureUrl.trim(),
          highlights: highlights.trim(),
          amenityIds,
        },
        token
      );

      onProjectCreated(project.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to create project');
    } finally {
      setSubmitting(false);
    }
  };

  const handleProjectImageUpload = async (files: FileList | null) => {
    if (!token || !files || files.length === 0) return;

    const selected = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (selected.length === 0) {
      setError('Please choose image files only.');
      return;
    }

    setError('');
    setUploadingProjectImages(true);

    try {
      const uploaded: string[] = [];
      for (const file of selected) {
        const response = await uploadImageFile(token, 'realty_project', file, {
          maxSide: 1800,
          mimeType: 'image/webp',
          quality: 0.9,
        });
        uploaded.push(response.imageUrl);
      }
      setProjectImageUrls((current) => [...current, ...uploaded].slice(0, 30));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload project images');
    } finally {
      setUploadingProjectImages(false);
    }
  };

  const removeProjectImage = (index: number) => {
    setProjectImageUrls((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <section className="min-h-screen pb-16 pt-36 text-slate-900 lg:pt-40">
      <div className="page-container space-y-5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Back to Company Profile
        </button>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Builder Dashboard</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Add New Project</h1>
          <p className="mt-2 text-sm text-slate-600">
            Submit complete project and amenity details for publication.
          </p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading form...</div>
        ) : null}

        {!loading && !canCreateProject ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
            Select a builder/dealer company (admin) or sign in with a builder/dealer company-linked account.
          </div>
        ) : null}

        {!loading && canCreateProject ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="grid gap-3 md:grid-cols-2">
              {user?.role === 'admin' ? (
                <select
                  value={selectedCompanyId}
                  onChange={(event) => setSelectedCompanyId(event.target.value)}
                  className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 md:col-span-2"
                >
                  <option value="">Select Company</option>
                  {adminCompanies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name} ({company.companyType})
                    </option>
                  ))}
                </select>
              ) : null}
              <Input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="Project Name"
                className="h-11 bg-white"
              />
              <select
                value={projectType}
                onChange={(event) =>
                  setProjectType(event.target.value as 'Apartment' | 'Villa' | 'Plotted' | 'Commercial')
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700"
              >
                <option value="Apartment">Apartment</option>
                <option value="Villa">Villa</option>
                <option value="Plotted">Plotted</option>
                <option value="Commercial">Commercial</option>
              </select>
              <LgdLocationInput
                value={stateName}
                onChange={setStateName}
                placeholder="State"
                className="h-11 bg-white"
                suggestKind="state"
                indiaValueField="state"
              />
              <LgdLocationInput
                value={city}
                onChange={setCity}
                placeholder="City"
                className="h-11 bg-white"
                suggestKind="india"
                indiaValueField="village"
              />
              <LgdLocationInput
                value={area}
                onChange={setArea}
                placeholder="Area"
                className="h-11 bg-white"
                suggestKind="india"
                indiaValueField="subdistrict"
              />
              <Input
                value={landmark}
                onChange={(event) => setLandmark(event.target.value)}
                placeholder="Landmark"
                className="h-11 bg-white"
              />
              <div className="md:col-span-2">
                <LgdLocationAccuracyNote />
              </div>
              <Input
                value={fullAddress}
                onChange={(event) => setFullAddress(event.target.value)}
                placeholder="Full Address"
                className="h-11 bg-white md:col-span-2"
              />
              <Input
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
                placeholder="Latitude (optional)"
                className="h-11 bg-white"
              />
              <Input
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
                placeholder="Longitude (optional)"
                className="h-11 bg-white"
              />
              <Input
                value={priceMin}
                onChange={(event) => setPriceMin(event.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="Price Min"
                className="h-11 bg-white"
              />
              <Input
                value={priceMax}
                onChange={(event) => setPriceMax(event.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="Price Max"
                className="h-11 bg-white"
              />
              <Input
                value={pricePerSqft}
                onChange={(event) => setPricePerSqft(event.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="Price per sqft"
                className="h-11 bg-white"
              />
              <Input
                value={totalArea}
                onChange={(event) => setTotalArea(event.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="Total Area"
                className="h-11 bg-white"
              />
              <Input
                value={totalUnits}
                onChange={(event) => setTotalUnits(event.target.value.replace(/\D/g, ''))}
                placeholder="Total Units"
                className="h-11 bg-white"
              />
              <Input
                value={totalFloors}
                onChange={(event) => setTotalFloors(event.target.value.replace(/\D/g, ''))}
                placeholder="Total Floors"
                className="h-11 bg-white"
              />
              <Input
                type="date"
                value={possessionDate}
                onChange={(event) => setPossessionDate(event.target.value)}
                className="h-11 bg-white"
              />
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as 'Upcoming' | 'Under Construction' | 'Ready to Move')
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700"
              >
                <option value="Upcoming">Upcoming</option>
                <option value="Under Construction">Under Construction</option>
                <option value="Ready to Move">Ready to Move</option>
              </select>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Textarea
                value={configurationsText}
                onChange={(event) => setConfigurationsText(event.target.value)}
                placeholder="Configurations (one per line): 1BHK, 2BHK, 3BHK..."
                className="min-h-24 bg-white"
              />
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <Input
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    const files = event.target.files;
                    event.target.value = '';
                    void handleProjectImageUpload(files);
                  }}
                  className="h-11 bg-white"
                />
                {projectImageUrls.length > 0 ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {projectImageUrls.map((url, index) => (
                      <div key={`${url}-${index}`} className="rounded-md border border-slate-200 bg-white p-1">
                        <div className="relative overflow-hidden rounded" style={{ aspectRatio: '4 / 3' }}>
                          <img src={url} alt={`Project upload ${index + 1}`} className="h-full w-full object-cover" />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-1 h-7 w-full text-xs"
                          onClick={() => removeProjectImage(index)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <Input
                value={brochureUrl}
                onChange={(event) => setBrochureUrl(event.target.value)}
                placeholder="Brochure PDF URL (optional)"
                className="h-11 bg-white md:col-span-2"
              />
              <Textarea
                value={highlights}
                onChange={(event) => setHighlights(event.target.value)}
                placeholder="Highlights"
                className="min-h-28 bg-white md:col-span-2"
              />
            </div>

            <div className="mt-4">
              <AmenitySelector
                title="Amenities"
                options={amenityNames}
                selected={selectedAmenities}
                onChange={setSelectedAmenities}
                required
              />
            </div>

            {error ? (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex justify-end">
              <Button
                onClick={handleSubmit}
                disabled={submitting || uploadingProjectImages}
                className="h-11 rounded-xl bg-blue-700 px-5 text-white hover:bg-blue-800"
              >
                {uploadingProjectImages
                  ? 'Uploading images...'
                  : submitting
                    ? 'Submitting...'
                    : 'Create Project'}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
