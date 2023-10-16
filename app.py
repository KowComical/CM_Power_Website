import pandas as pd
import json
import base64
import datetime

import streamlit as st
from streamlit_toggle import st_toggle_switch
from st_pages import show_pages_from_config

show_pages_from_config()

# Set Streamlit Configuration
st.set_page_config(layout="wide")

# 隐藏所有东西
hide_streamlit_style = """
                <style>
                div[data-testid="stToolbar"] {
                visibility: visible;
                height: 1%;
                position: fixed;
                }
                div[data-testid="stDecoration"] {
                visibility: hidden;
                height: 0%;
                position: fixed;
                }
                div[data-testid="stStatusWidget"] {
                visibility: hidden;
                height: 0%;
                position: fixed;
                }
                #MainMenu {
                visibility: hidden;
                height: 0%;
                }
                header {
                visibility: hidden;
                height: 0%;
                }
                footer {
                visibility: hidden;
                height: 0%;
                }
                </style>
                """
st.markdown(hide_streamlit_style, unsafe_allow_html=True)


CONTINENT_COLORS = {
    'Asia': '#FFE5B4',          
    'Africa': '#FF9898',    
    'Europe': '#B0C4DE',        
    'North America': '#BA9192', 
    'South America': '#D8BFD8', 
    'Australia/Oceania': '#B4EEB4', 
    'Europe/Asia': '#B0C4DE',
}

current_date = datetime.datetime.now().strftime("%Y-%m-%d")

# 读取颜色
with open('./data/colors.txt', 'r') as file:
    COLORS = json.load(file)

def main():
    add_logo("./data/logo_edited.png")
    # Styling and Layout
    remote_css("https://cdnjs.cloudflare.com/ajax/libs/semantic-ui/2.4.1/semantic.min.css")
    local_css("./data/style.css")

    # Load the data
    df = pd.read_csv('./data/data_for_download.csv')

    # 复制一版给下载
    df_download = df.copy()

    with st.container():
      
      # 筛选能源类型
      selected_energy = st.sidebar.selectbox(
          'Select Energy Type',
          ['total', 'coal', 'gas', 'oil', 'nuclear', 'hydro', 'wind', 'solar', 'other', 'fossil', 'renewables'], index=0)
  
      df = df[df['type'] == selected_energy].reset_index(drop=True)

      # 筛选大洲
      continents = ['Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America']
      all_continents = ['All Continents'] + continents
      
      # Load previous selection from session_state or use default
      prev_selection = st.session_state.get('prev_selection', ['All Continents'])
      selected_continent = st.sidebar.multiselect(
          'Which continents do you want to select?',
          all_continents,
          default=prev_selection)
      
      # If "All Continents" is newly selected, reset to only "All Continents"
      if 'All Continents' in selected_continent and 'All Continents' not in prev_selection:
          selected_continent = ['All Continents']
      
      # If another continent is selected when "All Continents" is already selected, deselect "All Continents"
      elif 'All Continents' in selected_continent:
          selected_continent.remove('All Continents')
      
      # Save current selection to session_state for next time
      st.session_state.prev_selection = selected_continent
      
      # Determine the output based on the selection
      if 'All Continents' in selected_continent:
          selected_continents = continents
      else:
          selected_continents = selected_continent

    
      # 处理数据
      df = transform_data(df, selected_energy, selected_continents)

      # 按照值的大小排序
      df = df.sort_values(by='total_value', ascending=False).reset_index(drop=True)

      # cb_view_details = st.sidebar.checkbox('View Details')
      view_details = display_switch_button()
  
      table_scorecard = get_scorecard(df, view_details)
      st.markdown(table_scorecard, unsafe_allow_html=True)
  
      # 使用 Streamlit 的下载按钮进行一键下载
      if selected_energy == 'total':
          csv_data = df_download[df_download['type'] != 'total'].to_csv(index=False)
      else:
          csv_data = df_download[df_download['type'] == selected_energy].to_csv(index=False)
        
      st.sidebar.download_button(
          label=f"🗃️ Download :red[{selected_energy.title()}] Data as CSV",
          data=csv_data,
          file_name=f"{selected_energy}_data_{current_date}.csv",
          mime="text/csv",
          use_container_width=True,
      )



def add_logo(image_path):
    # Open the image file
    with open(image_path, "rb") as img_file:
        # Encode the image as Base64
        b64_string = base64.b64encode(img_file.read()).decode()
    
    # Insert the Base64 string into the CSS
    st.markdown(
        f"""
        <style>
            [data-testid="stSidebarNav"] {{
                background-image: url(data:image/png;base64,{b64_string});
                background-repeat: no-repeat;
                background-size: 80% auto;  /* Set width to 80% of the sidebar, height scales automatically */
                padding-top: 40px;  /* Adjust based on your image's height */
                background-position: 20px 20px;
            }}
        </style>
        """,
        unsafe_allow_html=True,
    )

def current_year_sum(group):
    latest_date_for_country = group['date'].max()
    current_year_data = group[group['date'].dt.year == latest_date_for_country.year]
    return current_year_data[current_year_data['date'] <= latest_date_for_country]['value'].sum()


def last_year_ytd_sum(group):
    latest_date_for_country = group['date'].max()
    lytd_end_date = latest_date_for_country.replace(year=latest_date_for_country.year - 1)
    last_year_data = group[group['date'].dt.year == lytd_end_date.year]
    return last_year_data[last_year_data['date'] <= lytd_end_date]['value'].sum()


def local_css(file_name):
    with open(file_name) as f:
        st.markdown(f'<style>{f.read()}</style>', unsafe_allow_html=True)


def remote_css(url):
    st.markdown(f'<link href="{url}" rel="stylesheet">', unsafe_allow_html=True)


# def header_bg(table_type):
#     return COLORS.get(table_type, "#BAD2DE")  # A soft warm default color

def header_bg(continent):
    return CONTINENT_COLORS.get(continent, "#BAD2DE")  # A soft warm default color


def read_data_sources_from_file(filename):
    with open(filename, 'r', encoding='utf-8') as f:  # Added encoding='utf-8'
        data = f.read()
        return eval(data)


def transform_data(df, selected_energy, selected_continents):
    df['value'] = df['value'] / 1000 # Gwh to Twh
    df['date'] = pd.to_datetime(df['date'])

    ytd_sum_res = df.groupby('country').apply(current_year_sum)
    lytd_sum_res = df.groupby('country').apply(last_year_ytd_sum)
    percentage_change_res = ((ytd_sum_res - lytd_sum_res) / lytd_sum_res) * 100

    results = [{'country': country,
                'max_date': max(df[df['country'] == country]['date']),
                'total_value': sum(df[df['country'] == country]['value']),
                'row_count': len(df[df['country'] == country])}
               for country in df['country'].unique()]

    df = pd.DataFrame(results)
    df['year_to_date_sum'] = df['country'].map(ytd_sum_res)
    df['percentage_change'] = df['country'].map(percentage_change_res)
    df['test_country'] = df['country']
    df['type'] = selected_energy

    # 读取国家信息
    data_description = pd.read_csv('./data/data_description.csv')
    
    data_description['duration'] = pd.to_datetime(data_description['duration']).dt.strftime('%Y-%b')

    df = pd.merge(df, data_description)

    # 筛选大洲
    if selected_continents:
      df = df[df['continent'].isin(selected_continents)].reset_index(drop=True)

    return df


def get_scorecard(df, view_details):
    n_countries = len(df)
    latest_date = min(df['max_date'].dt.strftime('%Y-%B'))
    # Example additional statistic
    selected_energy = df['type'].tolist()[0]
  
    table_scorecard = f"""
    <style>
        .ui.statistics .statistic .label {{
            margin-top: 10px !important; 
        }}

        .extra.content .meta {{
            font-size: 1.2rem;
            text-align: left;
            color: #333;
            font-weight: bold;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            padding: 5px;
        }}
    </style>

    <div class="ui four small statistics">
        <div class="grey statistic">
            <div class="value">
                {selected_energy}
            </div>
            <div class="label">
                energy type
            </div>
        </div>
        <div class="grey statistic">
            <div class="value">
                {n_countries}
            </div>
            <div class="label">
                number of key countries included so far
            </div>
        </div>
        <div class="grey statistic">
            <div class="value">
                {latest_date}
            </div>
            <div class="label">
                latest date for all countries
            </div>
        </div>
        <div class="grey statistic">
            <div class="value">
                Twh
            </div>
            <div class="label">
                Unit
            </div>
        </div>
    </div>
    """

    table_scorecard += "<br><br><br><div id='mydiv' class='ui centered cards'>"

    # <div class="content" style="background-color: {header_bg(row['type'])};">

    for index, row in df.iterrows():
        table_scorecard += f"""
            <div class="card">
                <div class="content" style="background-color: {header_bg(row['continent'])};">
                    <div class="header smallheader">{row['country']}</div>
                    <div class="meta smallheader">{row['continent']}</div>
                </div>
                <div class="content">
                    <div class="column kpi number">
                        {round(row['year_to_date_sum'], 2)}<br>
                        <p class="kpi text">Year-to-Date (YTD)</p>
                    </div>
                    <div class="column kpi number" style="color: {color_percentage(row['percentage_change'])};">
                        {row['percentage_change']:.2f}%<br>
                        <p class="kpi text">YTD YoY Change</p>
                    </div>
                </div>
                <div class="extra content">
                    <div class="meta"><i class="user icon"></i>Source: <a href="{row['source_url']}" target="_blank">{row['source']}</a></div>
                    <div class="meta"><i class="calendar alternate outline icon"></i> Updated to: {row['max_date'].strftime("%Y-%m-%d")}</div>
                </div>
                <div class="extra content" {view_details}> 
                    <div class="meta"><i class="history icon"></i> Time Resolution: {row['resolution']}</div>
                    <div class="meta"><i class="edit icon"></i> Data Starts: {row['duration']}</div>
                    <div class="meta"><i class="calendar times outline icon"></i> Update Frequency: {row['update_frequency']}</div>
                    <div class="meta"><i class="th icon"></i> Region Data Aviability: {row['region_data']}</div>
                </div>
            </div>"""

    return table_scorecard
    

def color_percentage(value):
    if value < 0:
        return "red"
    else:
        return "green"

def display_switch_button():

    # Initialize state if it doesn't exist
    if 'toggle_switch' not in st.session_state:
        st.session_state['toggle_switch'] = False

    # Use session_state for default_value
    st.session_state['toggle_switch'] = st_toggle_switch(
        label="Show More Details",
        key="switch",
        default_value=st.session_state['toggle_switch'],
        label_after=False,
        inactive_color="#D3D3D3",  # optional
        active_color="#11567f",  # optional
        track_color="#29B5E8",  # optional
    )

    if st.session_state['toggle_switch']:
        view_details=""
    else:
        view_details="""style="display: none;" """
        
    return view_details


if __name__ == '__main__':
    with st.spinner('Loading page...'):
        main()
